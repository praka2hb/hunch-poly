import { NextRequest, NextResponse } from 'next/server';
import redis from '@/app/lib/redis';

const DOME_API_BASE = 'https://api.domeapi.io/v1';
const DOME_API_KEY = process.env.DOME_API_KEY || '';
const CACHE_TTL = 30; // 30 seconds

/**
 * GET /api/polymarket/events
 *
 * Proxy to Dome API: GET /polymarket/events
 *
 * Query params:
 *   - limit            (default 20, max 100)
 *   - tag / tags       tag/category slug (e.g. "politics", "crypto")
 *   - status           "open" | "closed" (default "open")
 *   - include_markets  "true" to include nested markets
 *   - pagination_key   cursor for next page
 *   - event_slug       fetch a single event by slug
 *   - active           legacy: "true" maps to status=open
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const limit = Math.min(parseInt(sp.get('limit') || '20', 10), 100);
        const tag = sp.get('tag') || sp.get('tags') || undefined;
        // active=true → status=open (backwards compat with old mobile API calls)
        const statusParam = sp.get('status');
        const activeParam = sp.get('active');
        const status = statusParam || (activeParam === 'true' ? 'open' : undefined);
        const include_markets = sp.get('include_markets') === 'true' ? 'true' : 'false';
        const pagination_key = sp.get('pagination_key') || sp.get('offset') || undefined;
        const event_slug = sp.get('event_slug') || sp.get('search') || undefined;

        // Build Dome API URL
        const url = new URL(`${DOME_API_BASE}/polymarket/events`);
        url.searchParams.set('limit', String(limit));
        url.searchParams.set('include_markets', include_markets);
        if (tag) url.searchParams.set('tags', tag);
        if (status) url.searchParams.set('status', status);
        if (pagination_key) url.searchParams.set('pagination_key', pagination_key);
        if (event_slug) url.searchParams.set('event_slug', event_slug);

        const cacheKey = `dome:events:${url.search}`;

        try {
            const cached = await redis.get<any>(cacheKey);
            if (cached) {
                return NextResponse.json(cached, {
                    headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
                });
            }
        } catch { /* cache miss */ }

        const response = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json',
                ...(DOME_API_KEY && { 'x-api-key': DOME_API_KEY }),
            },
            signal: AbortSignal.timeout(15000),
        });

        if (!response.ok) {
            const text = await response.text();
            console.error(`[events] Dome API error ${response.status}:`, text);
            return NextResponse.json({ error: `Dome API error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();

        // Dome API returns { events, pagination }
        const result = {
            events: data.events || [],
            pagination: data.pagination || { limit, has_more: false, pagination_key: null },
        };

        try {
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        } catch { /* fire-and-forget */ }

        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
        });
    } catch (error: unknown) {
        console.error('[events] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch events', events: [] },
            { status: 500 }
        );
    }
}
