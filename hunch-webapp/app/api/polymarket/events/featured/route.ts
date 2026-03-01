import { NextResponse } from 'next/server';
import { fetchGammaFeaturedEvents } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/events/featured
 *
 * Returns top 10 featured active events sorted by 24hr volume.
 * Calls Gamma /events?featured=true&active=true&closed=false&order=volume24hr&ascending=false&limit=10
 * No params needed from caller.
 * Cache: 60 seconds.
 */
export async function GET() {
    try {
        const events = await fetchGammaFeaturedEvents();

        return NextResponse.json(events, {
            headers: {
                'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120',
            },
        });
    } catch (error: unknown) {
        console.error('[events/featured] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch featured events' },
            { status: 500 }
        );
    }
}
