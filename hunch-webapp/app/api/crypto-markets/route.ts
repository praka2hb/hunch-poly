import { NextRequest, NextResponse } from 'next/server';

const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

// Asset tag mapping for fallback queries
const ASSET_TAG_MAP: Record<string, string> = {
    btc: 'bitcoin',
    eth: 'ethereum',
    sol: 'solana',
};

/**
 * GET /api/crypto-markets/current?asset=btc&interval=5m
 *
 * Fetches the current active crypto up-or-down market for a given asset and interval.
 * Primary: uses series_ticker param. Fallback: uses tag_slug filtering.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const asset = (sp.get('asset') || 'btc').toLowerCase();
        const interval = sp.get('interval') || '5m';

        const seriesSlug = `${asset}-up-or-down-${interval}`;

        // Primary approach: series_ticker param
        let event = await fetchBySeriesTicker(seriesSlug);

        // Fallback: tag_slug approach
        if (!event) {
            event = await fetchByTagSlugs(asset, interval, seriesSlug);
        }

        if (!event || !event.markets || event.markets.length === 0) {
            return NextResponse.json(
                { error: 'No active market found', asset, interval },
                { status: 404 }
            );
        }

        const market = event.markets[0];
        const clobTokenIds = safeJsonParse(market.clobTokenIds) || [];
        const outcomePrices = safeJsonParse(market.outcomePrices) || [];

        const result = {
            conditionId: market.conditionId,
            upTokenId: clobTokenIds[0] || null,
            downTokenId: clobTokenIds[1] || null,
            marketTitle: event.title,
            currentSlug: event.slug,
            seriesSlug,
            asset,
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
        console.error('[crypto-markets/current] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch crypto market' },
            { status: 500 }
        );
    }
}

async function fetchBySeriesTicker(seriesSlug: string): Promise<any | null> {
    try {
        const url = `${GAMMA_BASE_URL}/events?series_ticker=${encodeURIComponent(seriesSlug)}&active=true&closed=false&limit=1`;
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const events = await res.json();
        if (Array.isArray(events) && events.length > 0) return events[0];
        return null;
    } catch {
        return null;
    }
}

async function fetchByTagSlugs(asset: string, interval: string, seriesSlug: string): Promise<any | null> {
    try {
        const intervalTag = interval.toUpperCase(); // "5M" or "15M"
        const assetTag = ASSET_TAG_MAP[asset] || asset;
        const url = `${GAMMA_BASE_URL}/events?tag_slug=${encodeURIComponent(intervalTag)}&tag_slug=${encodeURIComponent(assetTag)}&active=true&closed=false&limit=5`;
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const events = await res.json();
        if (!Array.isArray(events)) return null;
        return events.find((e: any) => e.seriesSlug === seriesSlug) || null;
    } catch {
        return null;
    }
}

function safeJsonParse(value: unknown): any {
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch { return value; }
    }
    return value;
}
