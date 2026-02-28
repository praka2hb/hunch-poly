import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaPriceHistory } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/price-history
 * 
 * Fetch price history for a market from Polymarket Gamma API.
 * 
 * Query params:
 *   - conditionId (required if tokenId not provided)
 *   - tokenId (required if conditionId not provided)
 *   - startTs (optional, unix timestamp)
 *   - endTs (optional, unix timestamp)
 *   - interval (optional, e.g. "1d", "1w", "max")
 *   - fidelity (optional, number of data points)
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const conditionId = sp.get('conditionId') || undefined;
        const tokenId = sp.get('tokenId') || undefined;
        const startTs = sp.get('startTs') ? parseInt(sp.get('startTs')!, 10) : undefined;
        const endTs = sp.get('endTs') ? parseInt(sp.get('endTs')!, 10) : undefined;
        const interval = sp.get('interval') || undefined;
        const fidelity = sp.get('fidelity') ? parseInt(sp.get('fidelity')!, 10) : undefined;

        if (!conditionId && !tokenId) {
            return NextResponse.json(
                { error: 'Either conditionId or tokenId is required' },
                { status: 400 }
            );
        }

        const history = await fetchGammaPriceHistory({
            conditionId,
            tokenId,
            startTs,
            endTs,
            interval,
            fidelity,
        });

        return NextResponse.json({
            history,
            meta: {
                conditionId,
                tokenId,
                points: history.length,
            },
        }, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error: unknown) {
        console.error('[API /polymarket/price-history] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch price history' },
            { status: 500 }
        );
    }
}
