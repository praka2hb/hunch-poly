import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaEvents } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/events
 * 
 * Fetch paginated events from Polymarket Gamma API.
 * 
 * Query params:
 *   - limit (default 20)
 *   - offset (default 0)
 *   - active (boolean, default true)
 *   - closed (boolean)
 *   - tag (tag_id for category filtering)
 *   - search (slug-based search)
 *   - order (sort field: "volume", "liquidity", "start_date")
 *   - ascending (boolean)
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const limit = parseInt(sp.get('limit') || '20', 10);
        const offset = parseInt(sp.get('offset') || '0', 10);
        const active = sp.has('active') ? sp.get('active') === 'true' : true;
        const closed = sp.has('closed') ? sp.get('closed') === 'true' : undefined;
        const tag_id = sp.get('tag') || undefined;
        const slug = sp.get('search') || undefined;
        const order = sp.get('order') || undefined;
        const ascending = sp.has('ascending') ? sp.get('ascending') === 'true' : undefined;

        const events = await fetchGammaEvents({
            limit,
            offset,
            active,
            closed,
            tag_id,
            slug,
            order,
            ascending,
        });

        return NextResponse.json({
            events,
            pagination: {
                offset,
                limit,
                total: events.length,
                hasMore: events.length === limit, // If we got a full page, there might be more
            },
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error: unknown) {
        console.error('[API /polymarket/events] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch events' },
            { status: 500 }
        );
    }
}
