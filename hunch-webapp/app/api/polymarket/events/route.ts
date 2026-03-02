import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaEvents } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/events
 *
 * Proxy to Polymarket Gamma API: GET /events
 *
 * Query params:
 *   - limit        (default 20, max 100)
 *   - offset       (default 0)
 *   - tag_slug     category slug (e.g. "politics", "crypto", "sports")
 *   - active       boolean (default true)
 *   - closed       boolean (default false)
 *   - featured     boolean
 *   - order        field to sort by (default "volume24hr")
 *   - ascending    boolean (default false)
 *   - volume_min   minimum volume filter
 *   - liquidity_min minimum liquidity filter
 *
 * Returns the full Gamma response with nested markets (already transformed).
 * Cache: 30 seconds.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;

        const limit = Math.min(parseInt(sp.get('limit') || '20', 10), 100);
        const offset = parseInt(sp.get('offset') || '0', 10);
        const tag_slug = sp.get('tag_slug') || undefined;
        const active = sp.get('active') !== null ? sp.get('active') === 'true' : true;
        const closed = sp.get('closed') !== null ? sp.get('closed') === 'true' : false;
        const featured = sp.get('featured') !== null ? sp.get('featured') === 'true' : undefined;
        const order = sp.get('order') || 'volume24hr';
        const ascending = sp.get('ascending') === 'true';
        // volume_min and liquidity_min are now hardcoded in the Gamma service

        const events = await fetchGammaEvents({
            limit,
            offset,
            tag_slug,
            active,
            closed,
            featured,
            order,
            ascending,
        });

        return NextResponse.json(events, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error: unknown) {
        console.error('[events] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch events' },
            { status: 500 }
        );
    }
}
