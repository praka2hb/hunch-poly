import { NextResponse } from 'next/server';
import { fetchGammaTopMarkets } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/markets/top
 *
 * Returns top 20 active markets sorted by 24hr volume.
 * Calls Gamma /markets?order=volume24hr&ascending=false&active=true&closed=false&limit=20
 * No params needed from caller. Powers the trending/top markets section.
 * Cache: 60 seconds.
 */
export async function GET() {
    try {
        const markets = await fetchGammaTopMarkets();

        return NextResponse.json(markets, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error: unknown) {
        console.error('[markets/top] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch top markets' },
            { status: 500 }
        );
    }
}
