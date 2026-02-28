import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaMarkets } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/markets
 * 
 * Fetch paginated markets from Polymarket Gamma API.
 * 
 * Query params:
 *   - limit (default 20)
 *   - offset (default 0)
 *   - active (boolean, default true)
 *   - closed (boolean)
 *   - condition_id (specific market lookup)
 *   - search (slug-based search)
 *   - order (sort field)
 *   - ascending (boolean)
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const limit = parseInt(sp.get('limit') || '20', 10);
        const offset = parseInt(sp.get('offset') || '0', 10);
        const active = sp.has('active') ? sp.get('active') === 'true' : true;
        const closed = sp.has('closed') ? sp.get('closed') === 'true' : undefined;
        const condition_id = sp.get('condition_id') || undefined;
        const slug = sp.get('search') || undefined;
        const order = sp.get('order') || undefined;
        const ascending = sp.has('ascending') ? sp.get('ascending') === 'true' : undefined;

        const markets = await fetchGammaMarkets({
            limit,
            offset,
            active,
            closed,
            condition_id,
            slug,
            order,
            ascending,
        });

        return NextResponse.json({
            markets,
            pagination: {
                offset,
                limit,
                total: markets.length,
                hasMore: markets.length === limit,
            },
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
            },
        });
    } catch (error: unknown) {
        console.error('[API /polymarket/markets] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch markets' },
            { status: 500 }
        );
    }
}
