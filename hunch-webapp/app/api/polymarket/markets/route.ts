import { NextRequest, NextResponse } from 'next/server';
import redis from '@/app/lib/redis';

const DOME_API_BASE = 'https://api.domeapi.io/v1';
const DOME_API_KEY = process.env.DOME_API_KEY || '';
const CACHE_TTL = 30;

/**
 * GET /api/polymarket/markets
 *
 * Proxy to Dome API: GET /polymarket/markets
 *
 * Query params:
 *   - limit          (default 20, max 100)
 *   - tags / tag     category tag(s)
 *   - status         "open" | "closed"
 *   - market_slug    filter by slug
 *   - event_slug     filter by event
 *   - condition_id   filter by condition ID
 *   - search         keyword search (2+ chars)
 *   - pagination_key cursor
 *   - min_volume     minimum volume USD filter
 *   - active         legacy: "true" maps to status=open
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const limit = Math.min(parseInt(sp.get('limit') || '20', 10), 100);
        const tags = sp.get('tags') || sp.get('tag') || undefined;
        const statusParam = sp.get('status');
        const activeParam = sp.get('active');
        const status = statusParam || (activeParam === 'true' ? 'open' : undefined);
        const market_slug = sp.get('market_slug') || undefined;
        const event_slug = sp.get('event_slug') || undefined;
        const condition_id = sp.get('condition_id') || undefined;
        const search = sp.get('search') || undefined;
        const pagination_key = sp.get('pagination_key') || sp.get('offset') || undefined;
        const min_volume = sp.get('min_volume') || undefined;

        const url = new URL(`${DOME_API_BASE}/polymarket/markets`);
        url.searchParams.set('limit', String(limit));
        if (tags) url.searchParams.set('tags', tags);
        if (status) url.searchParams.set('status', status);
        if (market_slug) url.searchParams.set('market_slug', market_slug);
        if (event_slug) url.searchParams.set('event_slug', event_slug);
        if (condition_id) url.searchParams.set('condition_id', condition_id);
        if (search) url.searchParams.set('search', search);
        if (pagination_key) url.searchParams.set('pagination_key', pagination_key);
        if (min_volume) url.searchParams.set('min_volume', min_volume);

        const cacheKey = `dome:markets:${url.search}`;

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
            console.error(`[markets] Dome API error ${response.status}:`, text);
            return NextResponse.json({ error: `Dome API error: ${response.status}` }, { status: response.status });
        }

        const data = await response.json();
        const result = {
            markets: data.markets || [],
            pagination: data.pagination || { limit, has_more: false },
        };

        try {
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(result));
        } catch { /* fire-and-forget */ }

        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30' },
        });
    } catch (error: unknown) {
        console.error('[markets] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch markets', markets: [] },
            { status: 500 }
        );
    }
}
