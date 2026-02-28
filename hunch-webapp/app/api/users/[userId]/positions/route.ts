import { NextRequest, NextResponse } from 'next/server';
import { getUserPositions } from '@/app/lib/positionService';

export interface UserPosition {
  marketTicker: string;
  side: 'yes' | 'no';
  netSize: number;
  avgEntryPrice: number;
  tradeCount: number;
  lastTradedAt: string;
  marketTitle?: string;
  marketSubtitle?: string;
  imageUrl?: string | null;
  colorCode?: string | null;
  currentPrice?: number | null;
  // Computed PnL fields
  enteredAmount: number;        // total USDC invested (cost basis)
  realizedPnl: number;          // raw DB value — source of truth for previous positions
  unrealizedPnl: number | null; // null for closed positions
  totalPnl: number | null;
  pnlPercent: number | null;    // percentage based on cost basis
  isClosed: boolean;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> }
) {
  try {
    const { userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const positionsByStatus = await getUserPositions(userId);

    const mapPosition = (p: any, isClosed: boolean): UserPosition => ({
      marketTicker: p.marketTicker,
      side: p.side,
      netSize: p.netQuantity,
      avgEntryPrice: p.avgEntryPrice,
      tradeCount: p.tradeCount,
      lastTradedAt: (p.closedAt ?? p.openedAt).toISOString(),
      marketTitle: p.market?.title ?? undefined,
      marketSubtitle: p.market?.subtitle ?? undefined,
      // image: prefer market-level image_url, fall back to event image
      imageUrl: p.market?.image_url ?? p.market?.imageUrl ?? p.eventImageUrl ?? null,
      colorCode: p.market?.color_code ?? null,
      currentPrice: p.currentPrice ?? null,
      enteredAmount: p.totalCostBasis ?? 0,
      realizedPnl: p.realizedPnL,
      unrealizedPnl: p.unrealizedPnL ?? null,
      totalPnl: p.totalPnL ?? null,
      pnlPercent: p.profitLossPercentage ?? null,
      isClosed,
    });

    const positions: UserPosition[] = positionsByStatus.active.map((p) => mapPosition(p, false));
    const previousPositions: UserPosition[] = positionsByStatus.previous.map((p) => mapPosition(p, true));

    return NextResponse.json({ positions, previousPositions }, { status: 200 });
  } catch (error: any) {
    console.error('[GET /api/users/:userId/positions] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch positions' },
      { status: 500 }
    );
  }
}
