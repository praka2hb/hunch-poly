import { NextResponse } from 'next/server';
import { fetchGammaTags } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/tags
 *
 * Returns full tag list from Gamma API (id, label, slug).
 * Powers dynamic category filter tabs on the mobile app.
 * Cache: 10 minutes — tags rarely change.
 */
export async function GET() {
    try {
        const tags = await fetchGammaTags();

        return NextResponse.json(tags, {
            headers: {
                'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200',
            },
        });
    } catch (error: unknown) {
        console.error('[tags] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch tags' },
            { status: 500 }
        );
    }
}
