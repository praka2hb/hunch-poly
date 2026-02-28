import { NextRequest, NextResponse } from 'next/server';
import { fetchEventsServer, fetchEventDetailsServer, Event } from '@/app/lib/dflowServer';
import { prisma } from '@/app/lib/db';

// Topic filters matching the frontend (from EventsList.tsx)
const TOPIC_FILTERS: Record<string, string[]> = {
  crypto: ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'solana', 'sol', 'token', 'defi', 'nft', 'blockchain', 'web3', 'memecoin', 'altcoin', 'stablecoin', 'usdc', 'usdt'],
  politics: ['election', 'president', 'congress', 'senate', 'vote', 'government', 'trump', 'biden', 'democrat', 'republican', 'political', 'governor', 'mayor', 'impeach', 'cabinet', 'white house', 'electoral'],
  sports: ['football', 'basketball', 'soccer', 'nfl', 'nba', 'mlb', 'nhl', 'tennis', 'golf', 'ufc', 'mma', 'boxing', 'f1', 'formula 1', 'racing', 'olympics', 'world cup', 'championship', 'playoff', 'super bowl', 'world series', 'finals', 'mvp', 'team', 'player'],
  entertainment: ['movie', 'film', 'music', 'celebrity', 'awards', 'oscar', 'grammy', 'emmy', 'tv show', 'streaming', 'netflix', 'disney', 'spotify', 'concert', 'album', 'box office', 'actor', 'actress', 'singer', 'rapper'],
  tech: ['ai ', ' ai', 'artificial intelligence', 'openai', 'chatgpt', 'gpt-', 'llm', 'machine learning', 'robotics', 'autonomous', 'iphone', 'android', 'software', 'app launch', 'product launch', 'tech company', 'silicon valley', 'semiconductor', 'chip', 'nvidia'],
  finance: ['stock', 'fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'wall street', 's&p 500', 'nasdaq', 'dow jones', 'treasury', 'bond', 'yield', 'earnings', 'quarterly'],
};

// Map API categories to frontend topic filters (normalize names)
const CATEGORY_MAP: Record<string, string> = {
  'crypto': 'crypto',
  'politics': 'politics',
  'sports': 'sports',
  'entertainment': 'entertainment',
  'tech': 'tech',
  'science and technology': 'tech',
  'finance': 'finance',
  'financials': 'finance',
  'economics': 'finance',
  'companies': 'finance', // Could map to tech or finance, using finance
  'elections': 'politics',
  'climate and weather': 'finance', // Default mapping
  'mentions': 'entertainment', // Default mapping
  'social': 'entertainment', // Default mapping
  'transportation': 'tech', // Default mapping
};

/**
 * GET /api/events/top-by-category
 * Returns the event with the highest volume from each category
 * Uses keyword matching like the frontend does
 */
export async function GET(request: NextRequest) {
    try {
        // Get query parameters
        const searchParams = request.nextUrl.searchParams;
        const statusParam = searchParams.get('status');
        // Don't default to 'active' - let it be undefined if not provided (dev API might not support it)
        const status = statusParam || undefined;
        const useVolume24h = searchParams.get('useVolume24h') === 'true';
        const limit = parseInt(searchParams.get('limit') || '100', 10); // Reduced default limit for dev API
        const perCategory = Math.max(1, parseInt(searchParams.get('perCategory') || '3', 10));

        console.log(`[API /events/top-by-category] Fetching events with status=${status || 'none'}, limit=${limit}, perCategory=${perCategory}`);

        // We'll try DB-indexed tickers first; if insufficient, fall back to DFlow list API
        const CATEGORY_COUNT = Object.keys(TOPIC_FILTERS).length; // 6 categories
        const MIN_EVENTS_FOR_DB = CATEGORY_COUNT * perCategory;
        let allEvents: Event[] = [];

        try {
            // Use lowercase model name for Prisma
            const indexedTickers = await (prisma as any).indexedEvent.findMany({
                select: { ticker: true },
                take: MIN_EVENTS_FOR_DB * 3, // some cushion
            }).catch((err: any) => {
                console.error('[API /events/top-by-category] Prisma query error:', err);
                // If table doesn't exist or model not found, return empty array
                return [];
            }) as Array<{ ticker: string }>;
            const tickers = indexedTickers?.map((t: { ticker: string }) => t.ticker) || [];

            if (tickers.length >= MIN_EVENTS_FOR_DB) {
                console.log(`[API /events/top-by-category] Using DB tickers path, tickers=${tickers.length}`);
                const results = await Promise.allSettled(
                    tickers.map((ticker: string) => 
                        fetchEventDetailsServer(ticker).catch((err: any) => {
                            console.warn(`[API /events/top-by-category] Failed to fetch event ${ticker}:`, err?.message || err);
                            throw err; // Re-throw to mark as rejected
                        })
                    )
                );
                const fulfilled = results.filter(
                    (r: PromiseSettledResult<Event>): r is PromiseFulfilledResult<Event> =>
                        r.status === 'fulfilled'
                );
                const rejected = results.filter(r => r.status === 'rejected');
                if (rejected.length > 0) {
                    console.warn(`[API /events/top-by-category] ${rejected.length}/${tickers.length} event fetches failed`);
                }
                allEvents = fulfilled
                    .map((r: PromiseFulfilledResult<Event>) => r.value)
                    .filter((ev: Event) => !!ev && !!ev.ticker);
            } else {
                console.log(
                    `[API /events/top-by-category] Not enough indexed tickers (${tickers.length} < ${MIN_EVENTS_FOR_DB}), falling back to DFlow list API`
                );
            }
        } catch (dbError) {
            console.error('[API /events/top-by-category] Error using DB tickers, falling back to DFlow list API:', dbError);
        }

        if (allEvents.length === 0) {
            console.log('[API /events/top-by-category] Using DFlow list API fallback...');

            let cursor: string | undefined = undefined;
            let hasMore = true;
            let pageCount = 0;
            const maxPages = 20; // Reduced limit - we don't need ALL events
            const categoryMatchCounts: Record<string, number> = {};
            const categoriesWithQuota = new Set<string>();

            while (hasMore && pageCount < maxPages) {
                try {
                    pageCount++;
                    console.log(`[API /events/top-by-category] Fetching page ${pageCount}...`);
                    
                    let response;
                    try {
                        response = await fetchEventsServer(limit, {
                            ...(status && { status }),
                            withNestedMarkets: false,
                            cursor,
                        });
                    } catch (error: any) {
                        // If status parameter causes issues, try without it
                        if (status && error.message.includes('400') && pageCount === 1) {
                            console.log(`[API /events/top-by-category] Retrying without status parameter...`);
                            response = await fetchEventsServer(limit, {
                                withNestedMarkets: false,
                                cursor,
                            });
                        } else {
                            throw error;
                        }
                    }

                    const events = response.events || [];
                    allEvents = [...allEvents, ...events];
                    cursor = response.cursor;
                    hasMore = !!cursor && events.length > 0;
                    
                    // Check which categories we've found events for
                    events.forEach(event => {
                        const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();
                        for (const [categoryId, keywords] of Object.entries(TOPIC_FILTERS)) {
                            if (keywords.length > 0 && keywords.some(keyword => searchText.includes(keyword.toLowerCase()))) {
                                const newCount = (categoryMatchCounts[categoryId] || 0) + 1;
                                categoryMatchCounts[categoryId] = newCount;
                                if (newCount >= perCategory) {
                                    categoriesWithQuota.add(categoryId);
                                }
                            }
                        }
                    });
                    
                    console.log(`[API /events/top-by-category] Page ${pageCount}: Fetched ${events.length} events, categories with quota ${categoriesWithQuota.size}/${CATEGORY_COUNT}`);
                    
                    // Stop early if we've found enough events for all categories (or close to it)
                    if (categoriesWithQuota.size >= CATEGORY_COUNT) {
                        console.log(`[API /events/top-by-category] Found enough events for all categories, stopping pagination`);
                        hasMore = false;
                    }
                } catch (error: any) {
                    console.error(`[API /events/top-by-category] Error fetching page ${pageCount}:`, error);
                    const errorMessage = error?.message || error?.toString() || 'Unknown error';
                    
                    // If it's a network error and we're on the first page with no events, provide helpful error
                    if (pageCount === 1 && allEvents.length === 0 && (
                        errorMessage.includes('Network error') || 
                        errorMessage.includes('timeout') ||
                        errorMessage.includes('ECONNREFUSED') ||
                        errorMessage.includes('ENOTFOUND') ||
                        errorMessage.includes('fetch failed')
                    )) {
                        console.error(`[API /events/top-by-category] DFlow API appears to be unreachable. Error: ${errorMessage}`);
                        // Return empty results instead of crashing
                        return NextResponse.json({
                            categories: {},
                            count: 0,
                            perCategory,
                            error: 'DFlow API is currently unreachable. Please check your network connection and API configuration.',
                            errorDetails: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
                        }, { status: 503 }); // Service Unavailable
                    }
                    
                    // If we have some events, continue with what we have
                    if (allEvents.length > 0) {
                        console.log(`[API /events/top-by-category] Stopping pagination, using ${allEvents.length} events collected so far`);
                        break;
                    }
                    throw error;
                }
            }

            console.log(`[API /events/top-by-category] Fetched total ${allEvents.length} events across ${pageCount} pages`);
        }

        // Filter events by category using keyword matching (like frontend)
        const results: Record<string, Array<Event & { volume: number; category: string }>> = {};

        // Process each category
        for (const [categoryId, keywords] of Object.entries(TOPIC_FILTERS)) {
            if (keywords.length === 0) continue;

            // Filter events that match this category's keywords
            const matchingEvents = allEvents
                .map(event => {
                    const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();
                    return {
                        event,
                        searchText,
                        volume: useVolume24h 
                            ? (event.volume24h ?? event.volume ?? 0)
                            : (event.volume ?? event.volume24h ?? 0),
                    };
                })
                .filter(({ searchText }) => keywords.some(keyword => searchText.includes(keyword.toLowerCase())))
                .sort((a, b) => b.volume - a.volume);

            if (matchingEvents.length === 0) {
                console.log(`[API /events/top-by-category] No events found for category: ${categoryId}`);
                continue;
            }

            const topEvents = matchingEvents.slice(0, perCategory);

            if (topEvents.length > 0) {
                results[categoryId] = topEvents.map(({ event, volume }) => ({
                    ...event,
                    volume,
                    category: categoryId,
                }));
                const topVolume = topEvents[0]?.volume ?? 0;
                console.log(`[API /events/top-by-category] Category ${categoryId}: Top ${topEvents.length} events, best volume = ${topVolume}`);
            }
        }

        console.log(`[API /events/top-by-category] Found top events for ${Object.keys(results).length} categories`);

        // Index the tickers we actually returned so future calls can use DB path
        try {
            const tickersToIndex = Array.from(
                new Set(
                    Object.values(results)
                        .flat()
                        .map((ev: Event & { volume: number; category: string }) => ev.ticker)
                        .filter((ticker): ticker is string => Boolean(ticker))
                )
            );

            if (tickersToIndex.length > 0) {
                await (prisma as any).indexedEvent.createMany({
                    data: tickersToIndex.map((ticker: string) => ({ ticker, source: 'top-by-category' })),
                    skipDuplicates: true,
                });
                console.log(`[API /events/top-by-category] Indexed ${tickersToIndex.length} event tickers`);
            }
        } catch (indexError) {
            console.error('[API /events/top-by-category] Error indexing event tickers:', indexError);
        }

        return NextResponse.json({
            categories: results,
            count: Object.keys(results).length,
            perCategory,
        });
    } catch (error: any) {
        console.error('[API /events/top-by-category] Error:', error);
        const errorMessage = error?.message || error?.toString() || 'Failed to fetch top events by category';
        const errorStack = error?.stack;
        console.error('[API /events/top-by-category] Error details:', { errorMessage, errorStack });
        return NextResponse.json(
            { 
                error: errorMessage,
                ...(process.env.NODE_ENV === 'development' && { stack: errorStack })
            },
            { status: 500 }
        );
    }
}
