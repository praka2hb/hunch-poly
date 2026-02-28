import { NextRequest, NextResponse } from 'next/server';

import { prisma } from '@/app/lib/db';

const MAX_TICKERS = 100;

export async function GET(request: NextRequest) {
  try {
    const eventTickersParam = request.nextUrl.searchParams.get('eventTickers');
    if (!eventTickersParam) {
      return NextResponse.json(
        { error: 'Missing eventTickers query param' },
        { status: 400 }
      );
    }

    const eventTickers = eventTickersParam
      .split(',')
      .map((ticker) => ticker.trim())
      .filter(Boolean)
      .slice(0, MAX_TICKERS);

    if (eventTickers.length === 0) {
      return NextResponse.json(
        { error: 'No valid event tickers provided' },
        { status: 400 }
      );
    }

    const evidence = await prisma.eventEvidence.findMany({
      where: { eventTicker: { in: eventTickers } },
      orderBy: { createdAt: 'desc' },
      distinct: ['eventTicker'],
    });

    return NextResponse.json({ evidence });
  } catch (error: any) {
    console.error('[events/evidence] Error:', error);
    return NextResponse.json(
      { error: error?.message || 'Failed to fetch evidence' },
      { status: 500 }
    );
  }
}
