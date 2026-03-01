import { NextRequest, NextResponse } from 'next/server';
import redis from '@/app/lib/redis';

const DOME_API_BASE = 'https://api.domeapi.io/v1';
const DOME_API_KEY = process.env.DOME_API_KEY || '';
const CACHE_TTL = 60; // 60 seconds

/**
 * GET /api/polymarket/candlesticks/[conditionId]
 *
 * Proxy to Dome API: GET /polymarket/candlesticks/{condition_id}
 *
 * Query params:
 *   - start_time (required) Unix timestamp in seconds
 *   - end_time   (required) Unix timestamp in seconds
 *   - interval   (optional) 1=1m, 60=1h, 1440=1d. Default 60.
 *
 * Returns:
 *   { candlesticks: CandleData[] }  – OHLCV candles for use by LightChart
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ conditionId: string }> }
) {
    try {
        const { conditionId } = await params;
        if (!conditionId) {
            return NextResponse.json({ error: 'conditionId is required' }, { status: 400 });
        }

        const sp = request.nextUrl.searchParams;
        const start_time = sp.get('start_time');
        const end_time = sp.get('end_time');
        const interval = sp.get('interval') || '60';

        if (!start_time || !end_time) {
            return NextResponse.json(
                { error: 'start_time and end_time are required' },
                { status: 400 }
            );
        }

        const cacheKey = `dome:candles:${conditionId}:${start_time}:${end_time}:${interval}`;

        // Check Redis cache
        try {
            const cached = await redis.get<any[]>(cacheKey);
            if (cached) {
                return NextResponse.json({ candlesticks: cached }, {
                    headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
                });
            }
        } catch { /* cache miss */ }

        // Build Dome API URL
        const url = new URL(`${DOME_API_BASE}/polymarket/candlesticks/${encodeURIComponent(conditionId)}`);
        url.searchParams.set('start_time', start_time);
        url.searchParams.set('end_time', end_time);
        url.searchParams.set('interval', interval);

        const response = await fetch(url.toString(), {
            headers: {
                'Content-Type': 'application/json',
                ...(DOME_API_KEY && { 'x-api-key': DOME_API_KEY }),
            },
            signal: AbortSignal.timeout(10000),
        });

        if (!response.ok) {
            console.error(`[candlesticks] Dome API error: ${response.status}`);
            return NextResponse.json({ candlesticks: [] }, { status: 200 });
        }

        const data = await response.json() as { candlesticks?: any[][] };
        const rawCandlesticks = data?.candlesticks || [];

        // Dome API returns: [ [candlestick_data_array, token_metadata], ... ]
        // We want to find the "Yes" / side_a token and map its OHLCV data
        // Each tuple: [ [{end_period_ts, price:{open,high,low,close,...}, volume, yes_ask, yes_bid}, ...], {token_id, side} ]
        const candles: {
            timestamp: number;
            open: number;
            high: number;
            low: number;
            close: number;
            volume: number;
        }[] = [];

        // Find the "Yes" token series (side_a) or just use the first one
        let targetSeries: any[] | null = null;
        for (const tuple of rawCandlesticks) {
            if (!Array.isArray(tuple) || tuple.length < 2) continue;
            const [dataArr, meta] = tuple;
            const side = (meta?.side || '').toLowerCase();
            // Prefer "yes", "up", "over" for the primary side
            if (['yes', 'up', 'over'].includes(side)) {
                targetSeries = Array.isArray(dataArr) ? dataArr : [];
                break;
            }
            // Fallback: take first series
            if (!targetSeries && Array.isArray(dataArr)) {
                targetSeries = dataArr;
            }
        }

        if (targetSeries) {
            for (const point of targetSeries) {
                const ts = point?.end_period_ts;
                const price = point?.price;
                if (!ts || !price) continue;
                candles.push({
                    timestamp: ts,
                    open: price.open ?? price.close ?? 0,
                    high: price.high ?? price.close ?? 0,
                    low: price.low ?? price.close ?? 0,
                    close: price.close ?? 0,
                    volume: point?.volume ?? 0,
                });
            }
            // Sort ascending
            candles.sort((a, b) => a.timestamp - b.timestamp);
        }

        // Cache result
        try {
            await redis.setex(cacheKey, CACHE_TTL, JSON.stringify(candles));
        } catch { /* fire-and-forget */ }

        return NextResponse.json({ candlesticks: candles }, {
            headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' },
        });
    } catch (error: unknown) {
        console.error('[candlesticks] Error:', error);
        return NextResponse.json(
            { error: error instanceof Error ? error.message : 'Failed to fetch candlesticks', candlesticks: [] },
            { status: 500 }
        );
    }
}
