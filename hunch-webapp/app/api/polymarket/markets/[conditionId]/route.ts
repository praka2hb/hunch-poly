import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaMarket } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/markets/[conditionId]
 *
 * Fetch a single market by condition ID from Polymarket Gamma API.
 * Calls Gamma /markets?condition_ids=[conditionId].
 * Returns the first result with all JSON string fields parsed into
 * arrays and derived percentage fields added.
 * Cache: 30 seconds.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ conditionId: string }> }
) {
    try {
        const { conditionId } = await params;

        if (!conditionId) {
            return NextResponse.json(
                { error: 'Market condition ID is required' },
                { status: 400 }
            );
        }

        const market = await fetchGammaMarket(conditionId);

        return NextResponse.json(market, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error: unknown) {
        console.error(`[API /polymarket/markets/[conditionId]] Error:`, error);
        const message = error instanceof Error ? error.message : 'Failed to fetch market';
        const status = message.includes('not found') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
