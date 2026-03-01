import { NextRequest, NextResponse } from 'next/server';
import redis, { CacheKeys, CacheTTL } from '@/app/lib/redis';
import { fetchGammaEvents, type TransformedEvent, type TransformedMarket } from '@/app/lib/polymarketGamma';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TopMarket {
    marketId: string;    // condition_id
    eventId: string;     // event slug or id
    eventTitle: string;
    eventImageUrl: string | null;
    marketTitle: string; // question
    image_url: string | null;
    pricing: Record<string, unknown>;
    status?: string;
}

interface HomeFeedResponse {
    events: Record<string, unknown>[];
    topMarkets: TopMarket[];
    pagination: { start: number; end: number; total: number; hasNext: boolean };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Parse outcome prices from Polymarket market.
 * outcome_prices is a JSON string like "[\"0.65\",\"0.35\"]"
 */
function parseOutcomePrices(market: TransformedMarket): { yesPrice: number; noPrice: number } {
    // TransformedMarket already has a parsed `prices` array from MarketDerived
    return {
        yesPrice: market.prices?.[0] ?? 0,
        noPrice: market.prices?.[1] ?? 0,
    };
}

/**
 * Normalize a Polymarket event into the shape the mobile app expects.
 * Maps Gamma API fields to the existing DFlow/Jupiter response shape.
 */
function normalizeEvent(event: TransformedEvent): Record<string, unknown> {
    const normalizedMarkets = (event.markets || []).map((market: TransformedMarket) => {
        const { yesPrice, noPrice } = parseOutcomePrices(market);
        return {
            // Map to expected field names
            marketId: market.conditionId,
            ticker: market.conditionId,
            title: market.question,
            status: market.active ? 'active' : (market.closed ? 'closed' : 'inactive'),
            volume: market.volumeNum,
            openInterest: null,
            image_url: market.image || market.icon || null,
            // Pricing in the expected shape
            pricing: {
                buyYesPriceUsd: yesPrice,
                sellYesPriceUsd: yesPrice,
                buyNoPriceUsd: noPrice,
                sellNoPriceUsd: noPrice,
                volume: market.volumeNum,
                volume24h: market.volume24hr,
                liquidityDollars: market.liquidityNum,
                openInterest: null,
            },
            // Polymarket-specific extras
            condition_id: market.conditionId,
            tokens: market.tokenIds,
            slug: market.slug,
            // Pass through metadata for the detail view
            metadata: {
                title: market.question,
                description: market.description,
                isTradable: market.acceptingOrders,
                closeTime: market.endDate ? new Date(market.endDate).getTime() : undefined,
            },
        };
    });

    return {
        eventId: event.slug || event.id,
        ticker: event.slug || event.id,
        title: event.title,
        volume: event.volume,
        image_url: event.image || event.icon || null,
        imageUrl: event.image || event.icon || null,
        metadata: {
            title: event.title,
            subtitle: event.description,
            imageUrl: event.image || event.icon || null,
            isLive: event.active,
        },
        markets: normalizedMarkets,
        // Pass through raw Polymarket fields
        slug: event.slug,
        category: event.category,
        active: event.active,
        closed: event.closed,
    };
}

/** Extract the single top market from a normalized event (highest volume). */
function extractTopMarketFromEvent(event: Record<string, unknown>): TopMarket | null {
    const markets = Array.isArray((event as any).markets)
        ? ((event as any).markets as Record<string, unknown>[])
        : [];
    if (markets.length === 0) return null;

    let best: Record<string, unknown> | null = null;
    let bestVol = -1;
    for (const m of markets) {
        const pricing = (m.pricing ?? {}) as Record<string, unknown>;
        const vol = Number(pricing.volume24h ?? pricing.volume ?? 0);
        if (vol > bestVol) { bestVol = vol; best = m; }
    }
    if (!best) return null;

    const metaObj = (event.metadata && typeof event.metadata === 'object')
        ? (event.metadata as Record<string, unknown>) : {};

    return {
        marketId: String(best.marketId ?? best.condition_id ?? ''),
        eventId: String(event.eventId ?? event.slug ?? ''),
        eventTitle: String(metaObj.title ?? event.title ?? ''),
        eventImageUrl: (event.image_url as string | null) ?? (metaObj.imageUrl as string | null) ?? null,
        marketTitle: String(best.title ?? ''),
        image_url: (best.image_url as string | null) ?? null,
        pricing: (best.pricing ?? {}) as Record<string, unknown>,
        status: (best.status as string) ?? undefined,
    };
}

// ─── Route Handler ───────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const category = sp.get('category') || undefined;
        const start = parseInt(sp.get('start') || '0', 10);
        const end = parseInt(sp.get('end') || '19', 10);
        const sortBy = sp.get('sortBy') || 'volume';
        const filter = sp.get('filter') || undefined;

        // ── 1. Check full-response cache ──────────────────────────────────────
        const cacheParams = `poly:${category ?? 'all'}:${start}:${end}:${sortBy}:${filter ?? 'none'}`;
        const cacheKey = CacheKeys.homeFeed(cacheParams);

        try {
            const cached = await redis.get<HomeFeedResponse>(cacheKey);
            if (cached) {
                const res = NextResponse.json(cached);
                res.headers.set('X-Cache', 'HIT');
                res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
                return res;
            }
        } catch { /* cache miss */ }

        // ── 2. Fetch events from Polymarket Gamma API ─────────────────────────
        const limit = end - start + 1;
        const events = await fetchGammaEvents({
            limit,
            offset: start,
            active: true,
            order: sortBy === 'volume' ? 'volume' : sortBy,
            ascending: false,
        });

        // ── 3. Normalize events to expected shape ─────────────────────────────
        const normalizedEvents = events.map(normalizeEvent);

        // ── 4. Build topMarkets from THIS page's events ───────────────────────
        const topMarkets: TopMarket[] = [];
        for (const event of normalizedEvents) {
            const tm = extractTopMarketFromEvent(event);
            if (tm) topMarkets.push(tm);
        }

        // ── 5. Build & cache response ─────────────────────────────────────────
        const response: HomeFeedResponse = {
            events: normalizedEvents,
            topMarkets,
            pagination: {
                start,
                end: start + normalizedEvents.length - 1,
                total: normalizedEvents.length,
                hasNext: normalizedEvents.length === limit,
            },
        };

        redis
            .setex(cacheKey, CacheTTL.EVENTS_LIST, JSON.stringify(response))
            .catch(() => { /* fire-and-forget */ });

        const res = NextResponse.json(response);
        res.headers.set('X-Cache', 'MISS');
        res.headers.set('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60');
        return res;
    } catch (error: unknown) {
        console.error('[API /home/feed] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch home feed' },
            { status: 500 }
        );
    }
}
