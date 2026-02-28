import { Prisma } from '@prisma/client';
import { prisma } from './db';
import redis, { CacheKeys } from './redis';

const DECIMALS = 1_000_000; // Both tokens and USDC use 6 decimals

export interface CreateTradeData {
  userId: string;
  marketTicker: string;
  eventTicker?: string;
  source?: string;
  provider?: string;
  side: 'yes' | 'no';
  action?: 'BUY' | 'SELL';
  amount: string;
  executedInAmount?: string;
  executedOutAmount?: string;
  transactionSig: string;
  externalOrderId?: string;
  quote?: string;
  entryPrice?: number;
  // Polymarket-specific fields
  conditionId?: string;
  tokenId?: string;
  orderStatus?: string;
  marketTitle?: string;
  feeAmount?: number;
  walletAddress?: string;
}

export interface TradeWithUser {
  id: string;
  userId: string;
  marketTicker: string;
  eventTicker: string | null;
  side: string;
  action: string;
  amount: string;
  transactionSig: string;
  quote: string | null;
  createdAt: Date;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
}

type PositionActionResult = {
  positionId: string | null;
};

const NET_QTY_EPSILON = 1e-9;

async function applyTradeToPosition(
  tx: Prisma.TransactionClient,
  userId: string,
  marketTicker: string,
  eventTicker: string | null,
  side: 'yes' | 'no',
  action: 'BUY' | 'SELL',
  executedInAmount: string | null,
  executedOutAmount: string | null
): Promise<PositionActionResult> {
  let position = await tx.position.findFirst({
    where: {
      userId,
      marketTicker,
      side,
      status: 'OPEN',
    },
    orderBy: { openedAt: 'desc' },
  });

  if (!position) {
    if (action === 'SELL') {
      // For on-chain only positions, we might receive a SELL trade before any BUY
      // has been persisted in the Position model. In that case, we still want to
      // record the trade but safely skip position updates/P&L.
      console.warn(
        '[tradeService] SELL trade received without an open position. Skipping position update.',
        { userId, marketTicker, side }
      );
      return { positionId: null };
    }
    position = await tx.position.create({
      data: {
        userId,
        marketTicker,
        eventTicker,
        side,
        status: 'OPEN',
      },
    });
  }

  if (action === 'BUY') {
    const usdcSpent = executedInAmount ? Number(executedInAmount) / DECIMALS : 0;
    const tokensReceived = executedOutAmount ? Number(executedOutAmount) / DECIMALS : 0;

    if (usdcSpent > 0 && tokensReceived > 0) {
      const prevQty = Number(position.netQuantity);
      const prevAvg = Number(position.avgEntryPrice);
      const newQty = prevQty + tokensReceived;
      const newAvgEntry =
        newQty > 0 ? (prevAvg * prevQty + usdcSpent) / newQty : prevAvg;

      await tx.position.update({
        where: { id: position.id },
        data: {
          netQuantity: newQty,
          avgEntryPrice: newAvgEntry,
          status: 'OPEN',
          closedAt: null,
        },
      });
    }
  } else if (action === 'SELL') {
    const tokensSold = executedInAmount ? Number(executedInAmount) / DECIMALS : 0;
    const usdcReceived = executedOutAmount ? Number(executedOutAmount) / DECIMALS : 0;

    if (tokensSold > 0 && usdcReceived > 0) {
      const prevQty = Number(position.netQuantity);
      const prevAvg = Number(position.avgEntryPrice);

      if (prevQty <= NET_QTY_EPSILON) {
        throw new Error('Cannot sell from a zero-quantity position');
      }
      if (tokensSold > prevQty + NET_QTY_EPSILON) {
        throw new Error('Sell quantity exceeds open position quantity');
      }

      const costBasisSold = prevAvg * tokensSold;
      const realizedPnLThisSell = usdcReceived - costBasisSold;
      const newQty = prevQty - tokensSold;
      const isClosed = newQty <= NET_QTY_EPSILON;

      await tx.position.update({
        where: { id: position.id },
        data: {
          netQuantity: isClosed ? 0 : newQty,
          realizedPnL: { increment: realizedPnLThisSell },
          status: isClosed ? 'CLOSED' : 'OPEN',
          closedAt: isClosed ? new Date() : null,
        },
      });
    }
  }

  return { positionId: position.id };
}

/**
 * Create a new trade (real trades only)
 */
export async function createTrade(data: CreateTradeData) {
  const trade = await prisma.$transaction(async (tx) => {
    const { positionId } = await applyTradeToPosition(
      tx,
      data.userId,
      data.marketTicker,
      data.eventTicker || null,
      data.side,
      data.action || 'BUY',
      data.executedInAmount || null,
      data.executedOutAmount || null
    );

    return tx.trade.create({
      data: {
        userId: data.userId,
        marketTicker: data.marketTicker,
        eventTicker: data.eventTicker || null,
        source: data.source || null,
        provider: data.provider || 'polymarket',
        side: data.side,
        action: data.action || 'BUY',
        amount: data.amount,
        executedInAmount: data.executedInAmount || null,
        executedOutAmount: data.executedOutAmount || null,
        transactionSig: data.transactionSig,
        externalOrderId: data.externalOrderId || null,
        quote: data.quote || null,
        entryPrice: data.entryPrice ?? null,
        positionId,
        // Polymarket-specific fields
        conditionId: data.conditionId || null,
        tokenId: data.tokenId || null,
        orderStatus: data.orderStatus || null,
        marketTitle: data.marketTitle || null,
        feeAmount: data.feeAmount ?? null,
        walletAddress: data.walletAddress || null,
      },
    });
  });

  // Invalidate feed caches for all followers of this user
  await invalidateUserFeedCaches(data.userId);

  return trade;
}

/**
 * Create a trade if it doesn't exist (idempotent)
 */
export async function createTradeIfNotExists(data: CreateTradeData) {
  const existing = await prisma.trade.findFirst({
    where: { transactionSig: data.transactionSig },
  });

  if (existing) {
    return existing;
  }

  return createTrade(data);
}

/**
 * Get trades for a specific user (real trades only)
 */
export async function getUserTrades(
  userId: string,
  limit: number = 50,
  offset: number = 0
): Promise<TradeWithUser[]> {
  const trades = await prisma.trade.findMany({
    where: {
      userId,
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return trades;
}

/**
 * Get trades by transaction signatures (for verification, real trades only)
 */
export async function getTradesBySignatures(signatures: string[]): Promise<TradeWithUser[]> {
  const trades = await prisma.trade.findMany({
    where: {
      transactionSig: {
        in: signatures,
      },
    },
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return trades;
}

/**
 * Update a trade's quote
 */
export async function updateTradeQuote(tradeId: string, quote: string, userId: string) {
  // Verify the trade belongs to the user
  const trade = await prisma.trade.findUnique({
    where: { id: tradeId },
  });

  if (!trade) {
    throw new Error('Trade not found');
  }

  if (trade.userId !== userId) {
    throw new Error('Unauthorized: You can only update your own trades');
  }

  const updatedTrade = await prisma.trade.update({
    where: { id: tradeId },
    data: { quote },
  });

  // Invalidate feed caches for all followers of this user
  await invalidateUserFeedCaches(userId);

  return updatedTrade;
}

/**
 * Get all recent trades (global feed, real trades only)
 * Used for unauthenticated users or discovery feed
 */
export async function getAllRecentTrades(
  limit: number = 50,
  offset: number = 0
): Promise<TradeWithUser[]> {
  const trades = await prisma.trade.findMany({
    include: {
      user: {
        select: {
          id: true,
          displayName: true,
          avatarUrl: true,
          walletAddress: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
  });

  return trades;
}

/**
 * Invalidate feed caches for all followers of a user
 * This is called when a user makes a new trade
 */
async function invalidateUserFeedCaches(userId: string) {
  // Get all followers of this user
  const followers = await prisma.follow.findMany({
    where: { followingId: userId },
    select: { followerId: true },
  });

  // Invalidate feed cache for each follower
  const cacheKeys = followers.map((f) => CacheKeys.feed(f.followerId));
  if (cacheKeys.length > 0) {
    await redis.del(...cacheKeys);
  }
}

/**
 * Get user positions from the Position model (with PnL data)
 */
export async function getUserPositionsFromDB(userId: string) {
  const positions = await prisma.position.findMany({
    where: { userId },
    include: {
      trades: {
        orderBy: { createdAt: 'desc' },
        take: 10, // Last 10 trades per position
      }
    },
    orderBy: { updatedAt: 'desc' }
  });

  return positions;
}

/**
 * Get portfolio stats for a user
 */
export async function getPortfolioStats(userId: string): Promise<{
  totalRealizedPnL: number;
  totalCostBasis: number;
  totalSellProceeds: number;
  openPositions: number;
  closedPositions: number;
}> {
  const positions = await prisma.position.findMany({
    where: { userId },
    select: {
      realizedPnL: true,
      avgEntryPrice: true,
      netQuantity: true,
      status: true,
    }
  });

  const stats = positions.reduce((acc, pos) => {
    acc.totalRealizedPnL += Number(pos.realizedPnL);
    acc.totalCostBasis += Number(pos.avgEntryPrice) * Number(pos.netQuantity);

    if (pos.status === 'OPEN') acc.openPositions++;
    else if (pos.status === 'CLOSED') acc.closedPositions++;

    return acc;
  }, {
    totalRealizedPnL: 0,
    totalCostBasis: 0,
    totalSellProceeds: 0,
    openPositions: 0,
    closedPositions: 0,
  });

  return stats;
}
