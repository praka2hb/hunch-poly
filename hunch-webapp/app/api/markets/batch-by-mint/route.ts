import { NextRequest, NextResponse } from 'next/server';
import { fetchMarketsBatchServer } from '@/app/lib/dflowServer';

export async function POST(request: NextRequest) {
  console.log('[API /markets/batch-by-mint] Route called');

  try {
    const body = await request.json();
    const { mints } = body;

    console.log('[API /markets/batch-by-mint] Received mints:', mints);

    if (!mints || !Array.isArray(mints) || mints.length === 0) {
      console.log('[API /markets/batch-by-mint] Invalid mints array');
      return NextResponse.json(
        { error: 'mints array is required' },
        { status: 400 }
      );
    }

    console.log('[API /markets/batch-by-mint] Calling fetchMarketsBatchServer...');

    // Call server-side function to fetch markets by mints
    const markets = await fetchMarketsBatchServer(mints);

    console.log('[API /markets/batch-by-mint] Success, returning', markets.length, 'markets');

    return NextResponse.json(
      { markets },
      { status: 200 }
    );
  } catch (error: any) {
    console.error('[API /markets/batch-by-mint] Error:', error.message);
    return NextResponse.json(
      { error: error.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
