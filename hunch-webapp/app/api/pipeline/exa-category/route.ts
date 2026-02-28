import { NextRequest, NextResponse } from 'next/server';

import { fetchEventDetailsServer } from '@/app/lib/dflowServer';
import { runPipelineForEvent, PipelineEventResult } from '@/app/lib/exaPipeline';
import { prisma } from '@/app/lib/db';

const DEFAULT_LIMIT = 50;
const DEFAULT_PER_CATEGORY = 5;
const DEFAULT_CONCURRENCY = 2;

// Topic filters matching the frontend (all 13 Home page categories)
const TOPIC_FILTERS: Record<string, string[]> = {
    crypto: ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'solana', 'sol', 'token', 'defi', 'nft', 'blockchain', 'web3', 'memecoin', 'altcoin', 'stablecoin', 'usdc', 'usdt'],
    politics: ['president', 'congress', 'senate', 'government', 'trump', 'biden', 'democrat', 'republican', 'political', 'governor', 'mayor', 'impeach', 'cabinet', 'white house'],
    economics: ['fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'treasury', 'bond', 'yield', 'economic', 'tariff', 'trade war', 'unemployment', 'cpi', 'ppi'],
    sports: ['football', 'basketball', 'soccer', 'nfl', 'nba', 'mlb', 'nhl', 'tennis', 'golf', 'ufc', 'mma', 'boxing', 'f1', 'formula 1', 'racing', 'olympics', 'world cup', 'championship', 'playoff', 'super bowl'],
    entertainment: ['movie', 'film', 'music', 'celebrity', 'awards', 'oscar', 'grammy', 'emmy', 'tv show', 'streaming', 'netflix', 'disney', 'spotify', 'concert', 'album', 'box office'],
    tech: ['ai ', ' ai', 'artificial intelligence', 'openai', 'chatgpt', 'gpt-', 'llm', 'machine learning', 'robotics', 'autonomous', 'iphone', 'android', 'software', 'app launch', 'product launch'],
    finance: ['stock', 's&p 500', 'nasdaq', 'dow jones', 'earnings', 'quarterly', 'ipo', 'merger', 'acquisition', 'market cap', 'shares', 'dividend'],
    elections: ['election', 'vote', 'voting', 'ballot', 'primary', 'caucus', 'electoral', 'candidate', 'poll', 'swing state', 'midterm', 'runoff'],
    companies: ['company', 'corporate', 'ceo', 'layoff', 'hire', 'startup', 'founder', 'business', 'corporation'],
    climate: ['climate', 'weather', 'temperature', 'hurricane', 'wildfire', 'flood', 'drought', 'storm', 'tornado', 'warming'],
    mentions: ['trending', 'viral', 'mention', 'hashtag', 'social media', 'twitter', 'x.com'],
    social: ['protest', 'movement', 'activism', 'rally', 'demonstration', 'community', 'public opinion'],
    transportation: ['airline', 'aviation', 'car', 'automotive', 'tesla', 'ev ', 'electric vehicle', 'train', 'shipping', 'port', 'logistics'],
    science: ['space', 'nasa', 'rocket', 'satellite', 'research', 'discovery', 'science', 'physics', 'biology', 'medical'],
};

// Allowed categories that can be processed
const ALLOWED_CATEGORIES = [
    'crypto', 'politics', 'economics', 'sports', 'entertainment', 'tech', 'finance',
    'elections', 'companies', 'climate', 'mentions', 'social', 'transportation', 'science', 'all'
];

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
}

async function fetchEventsForCategory(category: string, limit: number): Promise<Event[]> {
    const { fetchEventsServer } = await import('@/app/lib/dflowServer');

    // Fetch events and filter by category keywords
    let allEvents: Event[] = [];
    let cursor: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 10; // Increased to find more events
    const minEventsToCollect = limit * 3; // Collect more events to ensure we get the top N by volume

    const keywords = TOPIC_FILTERS[category] || [];
    if (keywords.length === 0 && category !== 'all') {
        console.log(`[exa-category] No keywords for category: ${category}`);
        return [];
    }

    console.log(`[exa-category] Searching for ${category} events with keywords: ${keywords.slice(0, 5).join(', ')}...`);

    while (pageCount < maxPages) {
        pageCount++;
        try {
            const response = await fetchEventsServer(25, { // Use 25 to avoid ticker limit
                withNestedMarkets: true,
                cursor,
                status: 'active', // Only fetch active events
            });

            const events = response.events || [];

            // Filter to only active events (double-check status)
            const activeEvents = events.filter((e: any) =>
                e.status !== 'finalized' &&
                e.status !== 'resolved' &&
                e.status !== 'closed'
            );

            if (category === 'all') {
                allEvents = [...allEvents, ...activeEvents];
            } else {
                // Filter by keywords
                const matchingEvents = activeEvents.filter((event: Event) => {
                    const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();
                    return keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
                });
                allEvents = [...allEvents, ...matchingEvents];
            }

            cursor = response.cursor;

            console.log(`[exa-category] Page ${pageCount}: Found ${allEvents.length} matching events so far`);

            // Collect enough events to ensure we get the true top N by volume
            if (!cursor || allEvents.length >= minEventsToCollect) {
                break;
            }
        } catch (error: any) {
            console.error(`[exa-category] Error fetching page ${pageCount}:`, error?.message);
            break;
        }
    }

    console.log(`[exa-category] Total ${category} events found: ${allEvents.length}`);

    // Sort by volume (highest first) and take top N
    const sorted = allEvents
        .sort((a, b) => (b.volume || b.volume24h || 0) - (a.volume || a.volume24h || 0))
        .slice(0, limit);

    console.log(`[exa-category] Top ${limit} by volume:`);
    sorted.forEach((e, i) => {
        console.log(`   ${i + 1}. ${e.ticker} - Volume: $${(e.volume || e.volume24h || 0).toLocaleString()}`);
    });

    return sorted;
}

/**
 * GET /api/pipeline/exa-category?category=crypto&limit=5
 * 
 * Process news for top events in a specific category.
 * 
 * Params:
 *   - category: crypto | politics | economics | sports | entertainment | tech | finance | all
 *   - limit: number of events to process (default 5)
 *   - skip: number of events to skip (for pagination)
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category')?.toLowerCase() || 'all';
    const limit = Math.min(getNumberEnv(searchParams.get('limit') ?? undefined, DEFAULT_PER_CATEGORY), 20);
    const skip = getNumberEnv(searchParams.get('skip') ?? undefined, 0);
    const concurrency = getNumberEnv(
        process.env.EXA_PIPELINE_CONCURRENCY,
        DEFAULT_CONCURRENCY
    );

    // Validate category
    if (!ALLOWED_CATEGORIES.includes(category)) {
        return NextResponse.json(
            { error: `Invalid category. Allowed: ${ALLOWED_CATEGORIES.join(', ')}` },
            { status: 400 }
        );
    }

    console.log(`[exa-category] Starting pipeline for category: ${category}, limit: ${limit}, skip: ${skip}`);

    try {
        // Fetch events for the category
        const events = await fetchEventsForCategory(category, limit + skip);
        const eventsToProcess = events.slice(skip, skip + limit);

        if (eventsToProcess.length === 0) {
            return NextResponse.json({
                category,
                message: 'No events found for this category',
                results: [],
                stats: { eventsProcessed: 0, exaCalls: 0, geminiCalls: 0, evidenceCreated: 0 },
            });
        }

        console.log(`[exa-category] Processing ${eventsToProcess.length} events for ${category}`);

        let consecutiveExaFailures = 0;
        let aborted = false;

        const results = await mapWithConcurrency(eventsToProcess, concurrency, async (event, idx) => {
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

            console.log(`[exa-category] [${idx + 1}/${eventsToProcess.length}] Processing: ${event.ticker}`);

            // Fetch full event details if needed
            let eventWithMarkets = event;
            if (!event.markets || event.markets.length === 0) {
                try {
                    eventWithMarkets = await fetchEventDetailsServer(event.ticker);
                } catch (err: any) {
                    console.warn(`[exa-category] Failed to fetch details for ${event.ticker}:`, err?.message);
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
                console.warn(`[exa-category] Circuit breaker triggered after 3 consecutive Exa failures`);
            }

            return eventResult;
        });

        // Save evidence to database
        const outputs = results.flatMap((result) => result.outputs);

        console.log(`[exa-category] Total raw outputs: ${outputs.length}`);

        const evidenceRows = outputs
            .filter((output) => {
                const hasHeadline = !!output.llmOutput.headline;
                const hasSources = output.sourceUrls?.length > 0;

                if (!hasHeadline) {
                    console.log(`[exa-category] Dropping result for ${output.eventTicker}: No headline`);
                }
                if (!hasSources) {
                    console.log(`[exa-category] Dropping result for ${output.eventTicker}: No sources`);
                }

                return hasHeadline && hasSources;
            })
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

        console.log(`[exa-category] Final evidence rows to save: ${evidenceRows.length}`);

        let evidenceCreated = 0;
        if (evidenceRows.length > 0) {
            try {
                await (prisma as any).eventEvidence.createMany({
                    data: evidenceRows,
                    skipDuplicates: true,
                });
                evidenceCreated = evidenceRows.length;
                console.log(`[exa-category] Saved ${evidenceCreated} evidence rows to database`);
            } catch (dbError: any) {
                console.error(`[exa-category] Failed to save evidence:`, dbError?.message);
            }
        }

        // Index the event tickers
        try {
            const tickersToIndex = eventsToProcess.map(e => e.ticker).filter(Boolean);
            if (tickersToIndex.length > 0) {
                await (prisma as any).indexedEvent.createMany({
                    data: tickersToIndex.map((ticker: string) => ({ ticker, source: `exa-${category}` })),
                    skipDuplicates: true,
                });
            }
        } catch (indexError: any) {
            console.error(`[exa-category] Failed to index tickers:`, indexError?.message);
        }

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

        console.log(`[exa-category] Completed. Stats:`, stats);

        return NextResponse.json({
            category,
            results: outputs,
            stats,
            aborted,
            processedTickers: eventsToProcess.map(e => e.ticker),
            debugLogs: results.map(r => ({
                ticker: r.eventTicker,
                logs: r.logs || []
            }))
        });
    } catch (error: any) {
        console.error(`[exa-category] Pipeline error:`, error);
        return NextResponse.json(
            { error: error?.message || 'Pipeline failed', category },
            { status: 500 }
        );
    }
}
