import { NextRequest, NextResponse } from 'next/server';
import { unstable_cache } from 'next/cache';
import { createTradeIfNotExists, getUserTrades, updateTradeQuote } from '@/app/lib/tradeService';
import { getActiveCopySettingsForLeader } from '@/app/lib/copySettingsService';
import { publishCopyTradeJob } from '@/app/lib/qstash';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { notifyFollowersOfTrade } from '@/app/lib/notificationService';
import { createLogger } from '@/app/lib/logger';

const log = createLogger('trades');

export async function POST(request: NextRequest) {
  try {
    // SECURITY: Get userId from authenticated Privy session, not from body
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;

    const body = await request.json();
    const {
      marketTicker,
      eventTicker,
      side,
      action,
      amount,
      executedInAmount,
      executedOutAmount,
      transactionSig,
      quote,
      entryPrice
    } = body;

    if (!marketTicker || !side || !amount || !transactionSig) {
      return NextResponse.json(
        { error: 'All fields are required: marketTicker, side, amount, transactionSig' },
        { status: 400 }
      );
    }

    if (side !== 'yes' && side !== 'no') {
      return NextResponse.json(
        { error: 'side must be either "yes" or "no"' },
        { status: 400 }
      );
    }

    if (action && action !== 'BUY' && action !== 'SELL') {
      return NextResponse.json(
        { error: 'action must be either "BUY" or "SELL"' },
        { status: 400 }
      );
    }

    const trade = await createTradeIfNotExists({
      userId,
      marketTicker,
      eventTicker: eventTicker || undefined,
      side: side as 'yes' | 'no',
      action: action as 'BUY' | 'SELL' | undefined,
      amount,
      executedInAmount: executedInAmount || undefined,
      executedOutAmount: executedOutAmount || undefined,
      transactionSig,
      quote: quote || undefined,
      entryPrice: entryPrice && entryPrice !== 'null' ? parseFloat(entryPrice) : undefined,
      // Intentionally do NOT store executed token/usdc amounts.
    });

    // Fan-out: Enqueue copy trade jobs for all active followers
    // This is non-blocking - errors don't fail the leader's trade
    try {
      const activeCopyConfigs = await getActiveCopySettingsForLeader(trade.userId);
      log.info({ userId: trade.userId, configCount: activeCopyConfigs.length }, 'Copy trading fan-out');

      for (const config of activeCopyConfigs) {
        await publishCopyTradeJob(trade.id, config.followerId);
      }
    } catch (copyError) {
      // Log but don't fail the trade
      log.error({ err: copyError, userId: trade.userId }, 'Copy trading fan-out error');
    }

    // Push notifications to followers — fire-and-forget, never blocks trade response
    try {
      // We don't have displayName on the trade; fetch it once for the notification
      const { prisma } = await import('@/app/lib/db');
      const trader = await prisma.user.findUnique({
        where: { id: trade.userId },
        select: { displayName: true },
      });

      // Intentionally not awaited in a blocking way that could delay the response.
      // However we do await to ensure errors are caught by the try/catch.
      const notifResult = await notifyFollowersOfTrade(trade.userId, {
        displayName: trader?.displayName ?? null,
        marketTicker: trade.marketTicker,
        side: trade.side,
        action: trade.action,
        amount: trade.amount,
      });

      if (notifResult) {
        log.info(
          { sent: notifResult.sent, failed: notifResult.failed, userId: trade.userId },
          'Trade push notifications sent'
        );
      }
    } catch (notifError) {
      // CRITICAL: Notification failure must NEVER break trade creation
      log.error({ err: notifError, tradeId: trade.id }, 'Push notification error (non-fatal)');
    }

    return NextResponse.json(trade, { status: 201 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    log.error({ err: error }, 'Error creating trade');
    return NextResponse.json(
      { error: error.message || 'Failed to create trade' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId is required' },
        { status: 400 }
      );
    }

    // Check if we should skip cache
    const skipCache = request.headers.get('cache-control') === 'no-cache';

    const getCachedTrades = unstable_cache(
      async (uid: string, lim: number, off: number) => getUserTrades(uid, lim, off),
      [`trades-${userId}-${limit}-${offset}`],
      {
        revalidate: 3, // 3 second revalidation
        tags: [`trades-${userId}`]
      }
    );

    const trades = skipCache
      ? await getUserTrades(userId, limit, offset)
      : await getCachedTrades(userId, limit, offset);

    const response = NextResponse.json(trades, { status: 200 });

    if (!skipCache) {
      response.headers.set('Cache-Control', 'public, s-maxage=3, stale-while-revalidate=10');
    }

    return response;
  } catch (error: any) {
    console.error('Error fetching trades:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch trades' },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    // SECURITY: Get userId from authenticated Privy session, not from body
    const authUser = await getAuthenticatedUser(request);
    const userId = authUser.userId;

    const body = await request.json();
    const { tradeId, quote } = body;

    if (!tradeId) {
      return NextResponse.json(
        { error: 'tradeId is required' },
        { status: 400 }
      );
    }

    if (quote && quote.length > 280) {
      return NextResponse.json(
        { error: 'Quote must be 280 characters or less' },
        { status: 400 }
      );
    }

    const updatedTrade = await updateTradeQuote(tradeId, quote || '', userId);

    return NextResponse.json(updatedTrade, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    console.error('Error updating trade quote:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update trade quote' },
      { status: 500 }
    );
  }
}

