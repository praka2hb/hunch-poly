import { NextRequest, NextResponse } from 'next/server';
import { searchGammaPublic } from '@/app/lib/polymarketGamma';

/**
 * GET /api/search/polymarket?q=<query>&limit=<number>
 *
 * Proxies the Gamma API /public-search endpoint.
 * Returns transformed events (with nested markets) and Polymarket profiles.
 */
export async function GET(request: NextRequest) {
    try {
        const q = request.nextUrl.searchParams.get('q')?.trim();
        if (!q || q.length < 2) {
            return NextResponse.json({ events: [], profiles: [] });
        }

        const limit = parseInt(request.nextUrl.searchParams.get('limit') || '10', 10);

        const result = await searchGammaPublic(q, { limitPerType: limit });

        const res = NextResponse.json(result);
        res.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
        return res;
    } catch (error: unknown) {
        console.error('[API /search/polymarket] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Search failed' },
            { status: 500 }
        );
    }
}
