import { NextRequest, NextResponse } from 'next/server';

const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

/**
 * GET /api/crypto-markets/next?currentSlug=btc-updown-5m-1772694000&interval=5m
 *
 * Computes the next market slug by incrementing the timestamp, then checks
 * if that market exists on Gamma.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const currentSlug = sp.get('currentSlug');
        const interval = sp.get('interval') || '5m';

        if (!currentSlug) {
            return NextResponse.json(
                { error: 'currentSlug query parameter is required' },
                { status: 400 }
            );
        }

        // Extract timestamp from slug — last segment after splitting by '-'
        const parts = currentSlug.split('-');
        const currentTimestamp = parts[parts.length - 1];
        const ts = parseInt(currentTimestamp, 10);

        if (isNaN(ts)) {
            return NextResponse.json(
                { error: 'Could not parse timestamp from currentSlug' },
                { status: 400 }
            );
        }

        const intervalSeconds = interval === '15m' ? 900 : 300;
        const nextTimestamp = ts + intervalSeconds;
        const nextSlug = currentSlug.replace(currentTimestamp, nextTimestamp.toString());

        // Fetch next market by slug
        const res = await fetch(
            `${GAMMA_BASE_URL}/events/slug/${encodeURIComponent(nextSlug)}?include_chat=false`,
            { next: { revalidate: 0 } }
        );

        if (!res.ok) {
            return NextResponse.json({ available: false });
        }

        const event = await res.json();

        if (!event || !event.active || !event.markets || event.markets.length === 0) {
            return NextResponse.json({ available: false });
        }

        const market = event.markets[0];
        const clobTokenIds = safeJsonParse(market.clobTokenIds) || [];
        const outcomePrices = safeJsonParse(market.outcomePrices) || [];

        // Infer asset from slug prefix (e.g. "btc-updown-5m-...")
        const slugPrefix = nextSlug.split('-updown-')[0] || 'btc';

        const result = {
            available: true,
            conditionId: market.conditionId,
            upTokenId: clobTokenIds[0] || null,
            downTokenId: clobTokenIds[1] || null,
            marketTitle: event.title,
            currentSlug: event.slug,
            seriesSlug: event.seriesSlug || '',
            asset: slugPrefix,
            interval,
            closeTime: market.endDate ? new Date(market.endDate).getTime() : null,
            openTime: event.startDate ? new Date(event.startDate).getTime() : null,
            upProbability: outcomePrices[0] ? parseFloat(outcomePrices[0]) : null,
            downProbability: outcomePrices[1] ? parseFloat(outcomePrices[1]) : null,
            lastTradePrice: market.lastTradePrice,
            bestBid: market.bestBid,
            bestAsk: market.bestAsk,
            acceptingOrders: market.acceptingOrders,
        };

        return NextResponse.json(result, {
            headers: { 'Cache-Control': 'no-store, max-age=0' },
        });
    } catch (error: unknown) {
        console.error('[crypto-markets/next] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch next market' },
            { status: 500 }
        );
    }
}

function safeJsonParse(value: unknown): any {
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return value; }
    }
    return value;
}
