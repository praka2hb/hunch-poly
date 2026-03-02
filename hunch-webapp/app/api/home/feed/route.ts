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
    isLive?: boolean;
    outcomeLabel?: string;
}

interface HomeFeedResponse {
    events: Record<string, unknown>[];
    topMarkets: TopMarket[];
    pagination: { start: number; end: number; total: number; hasNext: boolean; nextStart: number };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Known Polymarket category slugs (order = display priority) */
const KNOWN_CATEGORIES = [
    'politics', 'crypto', 'sports', 'pop-culture', 'business',
    'science', 'tech', 'world', 'entertainment', 'economics', 'esports',
];

/** Normalize raw tags (can be strings or objects) into a flat string array */
function normalizeTags(tags: any): string[] {
    if (!Array.isArray(tags)) return [];
    return tags
        .map((t: any) => (typeof t === 'string' ? t : t?.slug || t?.label || ''))
        .filter(Boolean)
        .map((s: string) => s.toLowerCase());
}

/** Check if a normalized tag list matches a category slug */
function tagsMatchCategory(tags: string[], category: string): boolean {
    const cat = category.toLowerCase().replace(/-/g, ' ');
    return tags.some(tag => {
        const t = tag.replace(/-/g, ' ');
        return t === cat || t.includes(cat) || cat.includes(t);
    });
}

/** Infer the best-matching known category from a tags array */
function inferCategoryFromTags(tags: any): string | undefined {
    const normalized = normalizeTags(tags);
    for (const cat of KNOWN_CATEGORIES) {
        if (tagsMatchCategory(normalized, cat)) return cat;
    }
    return undefined;
}

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
            // Derived liveness flag for frontend guard
            isLive: market.isLive,
            // Short outcome label extracted from the market title
            outcomeLabel: market.outcomeLabel,
        };
    });

    return {
        eventId: event.slug || event.id,
        ticker: event.slug || event.id,
        title: event.title,
        volume: event.volume,
        volume24h: event.volume24hr,
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
        // Derive category from tags array (Gamma's category field is often null)
        category: event.category || inferCategoryFromTags(event.tags),
        tags: normalizeTags(event.tags),
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
        isLive: best.isLive as boolean | undefined,
        outcomeLabel: best.outcomeLabel as string | undefined,
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
        const active = sp.get('active') !== 'false';

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
        // Gamma's tag_slug filter is unreliable when combined with volume sorting,
        // so we fetch a larger pool and do reliable post-fetch filtering.
        // For non-category path: fetch 3× the page size to compensate for dead-market
        // filtering loss (filterDeadEvents typically removes 20-40% of events).
        const pageSize = end - start + 1;
        const fetchLimit = category ? Math.max(pageSize * 5, 50) : pageSize * 3;
        const events = await fetchGammaEvents({
            limit: fetchLimit,
            offset: category ? 0 : start,
            active,
            order: sortBy === 'volume' ? 'volume' : sortBy,
            ascending: false,
            // Still pass tag_slug as a hint — it works sometimes and reduces data
            tag_slug: category || undefined,
        });

        // ── 3. Post-fetch category filtering using tags array ─────────────────
        let filteredEvents = events;
        if (category) {
            filteredEvents = events.filter(event => {
                const tags = normalizeTags(event.tags);
                return tagsMatchCategory(tags, category);
            });
            // Apply pagination to filtered results
            filteredEvents = filteredEvents.slice(start, end + 1);
        } else {
            // Slice non-category results to the requested page size.
            // (events already filtered for dead markets inside fetchGammaEvents)
            filteredEvents = events.slice(0, pageSize);
        }

        // ── 4. Normalize events to expected shape ─────────────────────────────
        const normalizedEvents = filteredEvents.map(normalizeEvent);

        // ── 5. Build topMarkets from THIS page's events ───────────────────────
        const topMarkets: TopMarket[] = [];
        for (const event of normalizedEvents) {
            const tm = extractTopMarketFromEvent(event);
            if (tm) topMarkets.push(tm);
        }

        // ── 6. Build & cache response ─────────────────────────────────────────
        // hasNext: we had enough filtered events to fill the page, meaning more
        // data likely exists at higher Gamma offsets.
        const hasNext = events.length >= pageSize && normalizedEvents.length >= pageSize;
        const response: HomeFeedResponse = {
            events: normalizedEvents,
            topMarkets,
            pagination: {
                start,
                end: start + normalizedEvents.length - 1,
                total: normalizedEvents.length,
                hasNext,
                // nextStart is the raw Gamma offset the next page should begin at.
                // For non-category we advanced fetchLimit positions; for category
                // the next logical page offset is end + 1.
                nextStart: category ? end + 1 : start + fetchLimit,
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
