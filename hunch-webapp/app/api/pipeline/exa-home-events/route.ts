import { NextRequest, NextResponse } from 'next/server';

import { fetchEventDetailsServer } from '@/app/lib/dflowServer';
import { runPipelineForEvent, PipelineEventResult } from '@/app/lib/exaPipeline';
import { prisma } from '@/app/lib/db';

const DEFAULT_CONCURRENCY = 2;
const DEFAULT_EVENTS_PER_CATEGORY = 3;

// Categories to process - matching home page display
const HOME_CATEGORIES = ['crypto', 'politics', 'economics'];

// Topic filters for each category
const TOPIC_FILTERS: Record<string, string[]> = {
    crypto: ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'solana', 'sol', 'token', 'defi', 'nft', 'blockchain', 'web3', 'memecoin', 'altcoin', 'stablecoin', 'usdc', 'usdt'],
    politics: ['election', 'president', 'congress', 'senate', 'vote', 'government', 'trump', 'biden', 'democrat', 'republican', 'political', 'governor', 'mayor', 'impeach', 'cabinet', 'white house', 'electoral'],
    economics: ['fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'treasury', 'bond', 'yield', 'economic', 'tariff', 'trade war', 'unemployment', 'cpi', 'ppi'],
};

function getNumberEnv(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

async function mapWithConcurrency<T, R>(
    items: T[],
    limit: number,
    handler: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let index = 0;
    let active = 0;

    return new Promise((resolve) => {
        const next = () => {
            if (index >= items.length && active === 0) {
                resolve(results);
                return;
            }

            while (active < limit && index < items.length) {
                const currentIndex = index++;
                active += 1;
                handler(items[currentIndex], currentIndex)
                    .then((result) => {
                        results[currentIndex] = result;
                    })
                    .catch((error) => {
                        results[currentIndex] = error as R;
                    })
                    .finally(() => {
                        active -= 1;
                        next();
                    });
            }
        };

        next();
    });
}

interface Event {
    ticker: string;
    title: string;
    subtitle?: string;
    volume?: number;
    volume24h?: number;
    markets?: any[];
    category?: string;
}

async function fetchTopEventsForHomeCategories(eventsPerCategory: number): Promise<Event[]> {
    const { fetchEventsServer } = await import('@/app/lib/dflowServer');

    // Fetch events
    let allEvents: Event[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 5;

    // Track how many events we have per category
    const categoryEvents: Record<string, Event[]> = {};
    HOME_CATEGORIES.forEach(cat => { categoryEvents[cat] = []; });

    while (pageCount < maxPages) {
        pageCount++;
        try {
            const response = await fetchEventsServer(100, {
                withNestedMarkets: true,
                cursor,
            });

            const events = response.events || [];

            // Categorize each event
            for (const event of events) {
                const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();

                for (const category of HOME_CATEGORIES) {
                    const keywords = TOPIC_FILTERS[category] || [];
                    if (keywords.some(keyword => searchText.includes(keyword.toLowerCase()))) {
                        if (categoryEvents[category].length < eventsPerCategory * 2) { // Get extra for sorting
                            categoryEvents[category].push({ ...event, category });
                        }
                        break; // Only assign to first matching category
                    }
                }
            }

            cursor = response.cursor;

            // Check if we have enough events for all categories
            const allCategoriesFull = HOME_CATEGORIES.every(
                cat => categoryEvents[cat].length >= eventsPerCategory
            );

            if (!cursor || allCategoriesFull) {
                break;
            }
        } catch (error: any) {
            console.error(`[exa-home-events] Error fetching page ${pageCount}:`, error?.message);
            break;
        }
    }

    // For each category, sort by volume and take top N
    const result: Event[] = [];
    for (const category of HOME_CATEGORIES) {
        const topEvents = categoryEvents[category]
            .sort((a, b) => (b.volume || b.volume24h || 0) - (a.volume || a.volume24h || 0))
            .slice(0, eventsPerCategory);

        result.push(...topEvents);
        console.log(`[exa-home-events] Category ${category}: ${topEvents.length} events`);
    }

    return result;
}

/**
 * GET /api/pipeline/exa-home-events
 * 
 * Fetches news for the top 3 volume events from each of the home page categories:
 * - Crypto
 * - Politics  
 * - Economics
 * 
 * This matches exactly what's displayed on the /home page.
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const eventsPerCategory = getNumberEnv(searchParams.get('perCategory') ?? undefined, DEFAULT_EVENTS_PER_CATEGORY);
    const concurrency = getNumberEnv(
        process.env.EXA_PIPELINE_CONCURRENCY,
        DEFAULT_CONCURRENCY
    );

    console.log(`[exa-home-events] Starting pipeline for home page events`);
    console.log(`[exa-home-events] Categories: ${HOME_CATEGORIES.join(', ')}`);
    console.log(`[exa-home-events] Events per category: ${eventsPerCategory}`);

    try {
        // Fetch top events for home page categories
        const events = await fetchTopEventsForHomeCategories(eventsPerCategory);

        if (events.length === 0) {
            return NextResponse.json({
                message: 'No events found for home page categories',
                results: [],
                stats: { eventsProcessed: 0, exaCalls: 0, geminiCalls: 0, evidenceCreated: 0 },
            });
        }

        console.log(`[exa-home-events] Processing ${events.length} events total`);

        let consecutiveExaFailures = 0;
        let aborted = false;

        const results = await mapWithConcurrency(events, concurrency, async (event, idx) => {
            if (aborted) {
                return {
                    eventTicker: event.ticker,
                    outputs: [],
                    exaCalls: 0,
                    geminiCalls: 0,
                    exaSuccess: false,
                    exaError: 'Aborted by circuit breaker',
                } as PipelineEventResult;
            }

            console.log(`[exa-home-events] [${idx + 1}/${events.length}] Processing: ${event.ticker} (${event.category})`);

            // Fetch full event details if markets are missing
            let eventWithMarkets = event;
            if (!event.markets || event.markets.length === 0) {
                try {
                    eventWithMarkets = await fetchEventDetailsServer(event.ticker);
                    eventWithMarkets.category = event.category;
                } catch (err: any) {
                    console.warn(`[exa-home-events] Failed to fetch details for ${event.ticker}:`, err?.message);
                }
            }

            const eventResult = await runPipelineForEvent({
                ticker: eventWithMarkets.ticker,
                title: eventWithMarkets.title,
                markets: eventWithMarkets.markets ?? [],
            });

            if (!eventResult.exaSuccess && eventResult.exaCalls > 0) {
                consecutiveExaFailures += 1;
            } else if (eventResult.exaSuccess) {
                consecutiveExaFailures = 0;
            }

            if (consecutiveExaFailures >= 3) {
                aborted = true;
                console.warn(`[exa-home-events] Circuit breaker triggered after 3 consecutive Exa failures`);
            }

            return { ...eventResult, category: event.category };
        });

        // Save evidence to database
        const outputs = results.flatMap((result) => result.outputs);
        const evidenceRows = outputs
            .filter((output) => output.llmOutput.headline && output.sourceUrls?.length > 0)
            .map((output) => ({
                eventTicker: output.eventTicker,
                marketTicker: output.marketTicker,
                marketQuestion: output.marketQuestion,
                evidenceSentence: output.evidenceSentence ?? '',
                highlightScore: output.highlightScore ?? 0,
                classification: output.llmOutput.classification,
                headline: output.llmOutput.headline,
                explanation: output.llmOutput.explanation,
                sourceUrls: output.sourceUrls,
                sourceTitles: output.sourceTitles,
            }));

        let evidenceCreated = 0;
        if (evidenceRows.length > 0) {
            try {
                await (prisma as any).eventEvidence.createMany({
                    data: evidenceRows,
                    skipDuplicates: true,
                });
                evidenceCreated = evidenceRows.length;
                console.log(`[exa-home-events] Saved ${evidenceCreated} evidence rows to database`);
            } catch (dbError: any) {
                console.error(`[exa-home-events] Failed to save evidence:`, dbError?.message);
            }
        }

        // Index the event tickers
        try {
            const tickersToIndex = events.map(e => e.ticker).filter(Boolean);
            if (tickersToIndex.length > 0) {
                await (prisma as any).indexedEvent.createMany({
                    data: tickersToIndex.map((ticker: string) => ({ ticker, source: 'exa-home-events' })),
                    skipDuplicates: true,
                });
            }
        } catch (indexError: any) {
            console.error(`[exa-home-events] Failed to index tickers:`, indexError?.message);
        }

        // Group results by category for easier consumption
        const resultsByCategory: Record<string, any[]> = {};
        results.forEach((result: any) => {
            const cat = result.category || 'unknown';
            if (!resultsByCategory[cat]) resultsByCategory[cat] = [];
            resultsByCategory[cat].push({
                ticker: result.eventTicker,
                success: result.exaSuccess,
                outputs: result.outputs,
            });
        });

        const stats = results.reduce(
            (acc, result) => {
                acc.eventsProcessed += 1;
                acc.exaCalls += result.exaCalls;
                acc.geminiCalls += result.geminiCalls;
                acc.exaSuccessCount += result.exaSuccess ? 1 : 0;
                return acc;
            },
            { eventsProcessed: 0, exaCalls: 0, geminiCalls: 0, exaSuccessCount: 0, evidenceCreated }
        );

        console.log(`[exa-home-events] Completed. Stats:`, stats);

        return NextResponse.json({
            categories: HOME_CATEGORIES,
            resultsByCategory,
            stats,
            aborted,
            processedEvents: events.map(e => ({ ticker: e.ticker, category: e.category, title: e.title })),
        });
    } catch (error: any) {
        console.error(`[exa-home-events] Pipeline error:`, error);
        return NextResponse.json(
            { error: error?.message || 'Pipeline failed' },
            { status: 500 }
        );
    }
}
