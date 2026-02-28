import { NextRequest, NextResponse } from 'next/server';
import { fetchMarkets, Market } from '@/app/lib/api';
import { withCache, cacheKeys, CACHE_TTL } from '@/app/lib/cache';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { tickers } = body;

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return NextResponse.json(
        { error: 'tickers array is required' },
        { status: 400 }
      );
    }

    // Limit batch size to prevent abuse
    if (tickers.length > 100) {
      return NextResponse.json(
        { error: 'Maximum 100 tickers per batch request' },
        { status: 400 }
      );
    }

    // Fetch with cache
    const markets = await withCache(
      cacheKeys.marketsBatch(tickers),
      async () => {
        // Fetch all markets and filter by requested tickers
        const allMarkets = await fetchMarkets(200);
        const tickerSet = new Set(tickers);
        return allMarkets.filter(market => tickerSet.has(market.ticker));
      },
      { ttl: CACHE_TTL.MARKETS }
    );

    // Create a map for easy lookup
    const marketMap: Record<string, Market> = {};
    markets.forEach(market => {
      marketMap[market.ticker] = market;
    });

    const response = NextResponse.json(
      { markets: marketMap },
      { status: 200 }
    );

    // Add cache headers
    response.headers.set('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');

    return response;
  } catch (error: any) {
    console.error('Error fetching markets batch:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch markets' },
      { status: 500 }
    );
  }
}

