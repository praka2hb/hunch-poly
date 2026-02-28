import { NextRequest, NextResponse } from 'next/server';
import { fetchGammaEvent } from '@/app/lib/polymarketGamma';

/**
 * GET /api/polymarket/events/[slug]
 * 
 * Fetch a single event by slug from Polymarket Gamma API.
 * Returns the full event object with nested markets and tokens.
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
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch event' },
            { status: 500 }
        );
    }
}
