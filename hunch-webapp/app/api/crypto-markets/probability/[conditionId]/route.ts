import { NextRequest, NextResponse } from 'next/server';

const CLOB_BASE_URL = 'https://clob.polymarket.com';

/**
 * GET /api/crypto-markets/probability/[conditionId]?upTokenId={upTokenId}
 *
 * Fetches the Up token midpoint probability from the CLOB.
 * Down probability = 1 - Up probability.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ conditionId: string }> }
) {
    try {
        const { conditionId } = await params;
        const sp = request.nextUrl.searchParams;
        const upTokenId = sp.get('upTokenId');

        if (!upTokenId) {
            return NextResponse.json(
                { error: 'upTokenId query parameter is required' },
                { status: 400 }
            );
        }

        const res = await fetch(
            `${CLOB_BASE_URL}/midpoint?token_id=${encodeURIComponent(upTokenId)}`,
            { next: { revalidate: 0 } }
        );

        if (!res.ok) {
            const text = await res.text();
            console.error('[crypto-markets/probability] CLOB error:', res.status, text);
            return NextResponse.json(
                { error: 'Failed to fetch midpoint from CLOB' },
                { status: 502 }
            );
        }

        const data = await res.json();
        const mid = parseFloat(data.mid || '0.5');

        const result = {
            conditionId,
            upProbability: mid,
            downProbability: 1 - mid,
            upPct: Math.round(mid * 1000) / 10,
            downPct: Math.round((1 - mid) * 1000) / 10,
            timestamp: Date.now(),
        };

        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch (error: unknown) {
        console.error('[crypto-markets/probability] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch probability' },
            { status: 500 }
        );
    }
}
