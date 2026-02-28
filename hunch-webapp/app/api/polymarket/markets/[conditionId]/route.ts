import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaMarket } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/markets/[conditionId]
 * 
 * Fetch a single market by condition ID from Polymarket Gamma API.
 * Returns full market object with tokens and prices.
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
                'Cache-Control': 'public, s-maxage=15, stale-while-revalidate=30',
            },
        });
    } catch (error: unknown) {
        console.error(`[API /polymarket/markets/[conditionId]] Error:`, error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch market' },
            { status: 500 }
        );
    }
}
