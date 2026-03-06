import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';

const GAMMA_BASE_URL = process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';
const WS_PROXY_HTTP_URL = process.env.WS_PROXY_HTTP_URL;

// Interval durations in seconds
const INTERVAL_SECONDS: Record<string, number> = {
    '5m': 300,
    '15m': 900,
};

/**
 * GET /api/crypto-markets?asset=btc&interval=5m
 * Also re-exported at /api/crypto-markets/current (see current/route.ts)
 *
 * Computes the current market slug based on the aligned timestamp,
 * then fetches it from Gamma by slug.
 *
 * Slug format: {asset}-updown-{interval}-{alignedUnixTimestamp}
 * Example: btc-updown-5m-1772700000
 *
 * The timestamp is floor-aligned to the interval boundary in UTC.
 */
export async function GET(request: NextRequest) {
    try {
        const sp = request.nextUrl.searchParams;
        const asset = (sp.get('asset') || 'btc').toLowerCase();
        const interval = sp.get('interval') || '5m';
        const intervalSec = INTERVAL_SECONDS[interval] || 300;

        // Compute aligned timestamp (floor to interval boundary)
        const nowSec = Math.floor(Date.now() / 1000);
        const alignedTs = nowSec - (nowSec % intervalSec);

        // Build slug
        const slug = `${asset}-updown-${interval}-${alignedTs}`;

        // Primary: fetch by slug
        let event = await fetchBySlug(slug);

        // If the current aligned window's market isn't found, try the previous one
        // (market may not have been created yet for the current window)
        if (!event) {
            const prevTs = alignedTs - intervalSec;
            const prevSlug = `${asset}-updown-${interval}-${prevTs}`;
            event = await fetchBySlug(prevSlug);
        }

        // Fallback: search by tag_slug=crypto and filter client-side
        if (!event) {
            event = await fetchByTagFallback(asset, interval);
        }

        if (!event || !event.markets || event.markets.length === 0) {
            return NextResponse.json(
                { error: 'No active market found', asset, interval, attemptedSlug: slug },
                { status: 404 }
            );
        }

        const market = event.markets[0];
        const clobTokenIds = safeJsonParse(market.clobTokenIds) || [];
        const outcomePrices = safeJsonParse(market.outcomePrices) || [];

        const openTime = event.startDate ? new Date(event.startDate).getTime() : null;
        const closeTime = market.endDate ? new Date(market.endDate).getTime() : null;

        // ── Opening price resolution: 3-tier priority ─────────────────
        let openingPrice: number | null = null;
        let openingPriceIsAccurate = false;

        // Tier 1: Already stored in DB (most reliable — survives proxy restarts)
        const cached = await prisma.cryptoMarketCache.findUnique({
            where: { slug: event.slug },
        });

        if (cached) {
            openingPrice = cached.openingPrice;
            openingPriceIsAccurate = cached.isAccurate;
        }

        // Tier 2: Fetch from proxy buffer (accurate if proxy has it)
        if (!openingPrice && WS_PROXY_HTTP_URL && openTime) {
            try {
                const priceRes = await fetch(
                    `${WS_PROXY_HTTP_URL}/price-at/${asset}/${openTime}`,
                    { signal: AbortSignal.timeout(2000) }
                );
                if (priceRes.ok) {
                    const priceData = await priceRes.json();
                    openingPrice = priceData.price;
                    openingPriceIsAccurate = priceData.isAccurate;

                    // Store in DB — only if accurate, never overwrite with approximate
                    if (priceData.isAccurate && closeTime) {
                        await prisma.cryptoMarketCache.upsert({
                            where: { slug: event.slug },
                            create: {
                                slug: event.slug,
                                asset,
                                interval,
                                openingPrice: priceData.price,
                                openTime: BigInt(openTime),
                                closeTime: BigInt(closeTime),
                                isAccurate: true,
                            },
                            update: {}, // never overwrite once stored accurately
                        }).catch(() => {}); // non-blocking — don't fail the response
                    }
                }
            } catch {
                // Proxy unreachable — fall through to Tier 3
            }
        }

        // Tier 3: lastTradePrice as last resort (approximate)
        if (!openingPrice) {
            openingPrice = market.lastTradePrice;
            openingPriceIsAccurate = false;
        }

        const result = {
            conditionId: market.conditionId,
            upTokenId: clobTokenIds[0] || null,
            downTokenId: clobTokenIds[1] || null,
            marketTitle: event.title,
            currentSlug: event.slug,
            seriesSlug: `${asset}-updown-${interval}`,
            asset,
            interval,
            closeTime,
            openTime,
            upProbability: outcomePrices[0] ? parseFloat(outcomePrices[0]) : null,
            downProbability: outcomePrices[1] ? parseFloat(outcomePrices[1]) : null,
            lastTradePrice: market.lastTradePrice,
            bestBid: market.bestBid,
            bestAsk: market.bestAsk,
            acceptingOrders: market.acceptingOrders,
            openingPrice: openingPrice ?? market.lastTradePrice,
            openingPriceIsAccurate,
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

/** Fetch an event directly by slug */
async function fetchBySlug(slug: string): Promise<any | null> {
    try {
        const url = `${GAMMA_BASE_URL}/events/slug/${encodeURIComponent(slug)}?include_chat=false`;
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const event = await res.json();
        if (!event || !event.active || !event.markets || event.markets.length === 0) return null;
        return event;
    } catch {
        return null;
    }
}

/** Fallback: search by tag_slug=crypto, filter for updown markets */
async function fetchByTagFallback(asset: string, interval: string): Promise<any | null> {
    try {
        const url = `${GAMMA_BASE_URL}/events?tag_slug=crypto&active=true&closed=false&limit=10&order=startDate&ascending=false`;
        const res = await fetch(url, { next: { revalidate: 0 } });
        if (!res.ok) return null;
        const events = await res.json();
        if (!Array.isArray(events)) return null;
        // Find the first event whose slug matches the pattern {asset}-updown-{interval}-*
        const prefix = `${asset}-updown-${interval}-`;
        return events.find((e: any) => e.slug?.startsWith(prefix) && e.active) || null;
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
