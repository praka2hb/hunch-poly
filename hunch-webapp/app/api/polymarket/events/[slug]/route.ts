import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaEvent } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/events/[slug]
 *
 * Fetch a single event by slug from Polymarket Gamma API.
 * Calls Gamma /events?slug=[slug] and returns the single event
 * with all nested markets (already transformed with derived fields).
 * Cache: 30 seconds.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ slug: string }> }
) {
    try {
        const { slug } = await params;

        if (!slug) {
            return NextResponse.json(
                { error: 'Event slug is required' },
                { status: 400 }
            );
        }

        const event = await fetchGammaEvent(slug);

        return NextResponse.json(event, {
            headers: {
                'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60',
            },
        });
    } catch (error: unknown) {
        console.error(`[API /polymarket/events/[slug]] Error:`, error);
        const message = error instanceof Error ? error.message : 'Failed to fetch event';
        const status = message.includes('not found') ? 404 : 500;
        return NextResponse.json({ error: message }, { status });
    }
}
