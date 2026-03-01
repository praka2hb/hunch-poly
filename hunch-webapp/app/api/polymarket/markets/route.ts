import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaMarkets } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/markets
 *
 * Proxy to Polymarket Gamma API: GET /markets
 *
 * Query params:
 *   - limit          (default 20, max 100)
 *   - offset         (default 0)
 *   - order          field to sort by (default "volume24hr")
 *   - ascending      boolean (default false)
 *   - tag_id         integer tag ID filter
 *   - closed         boolean (default false)
 *   - condition_ids  comma-separated condition IDs
 *
 * Returns transformed market objects with derived fields.
 * Cache: 30 seconds.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;

        const limit = Math.min(parseInt(sp.get('limit') || '20', 10), 100);
        const offset = parseInt(sp.get('offset') || '0', 10);
        const order = sp.get('order') || 'volume24hr';
        const ascending = sp.get('ascending') === 'true';
        const tag_id = sp.get('tag_id') ? Number(sp.get('tag_id')) : undefined;
        const closed = sp.get('closed') !== null ? sp.get('closed') === 'true' : false;
        const condition_ids = sp.get('condition_ids') || undefined;

        const markets = await fetchGammaMarkets({
            limit,
            offset,
            order,
            ascending,
            tag_id,
            closed,
            condition_ids,
        });

        return NextResponse.json(markets, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error: unknown) {
        console.error('[markets] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch markets' },
            { status: 500 }
        );
    }
}
