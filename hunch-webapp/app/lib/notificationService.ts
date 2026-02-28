import Expo, {
  ExpoPushMessage,
  ExpoPushTicket,
  ExpoPushSuccessTicket,
  ExpoPushErrorTicket,
} from 'expo-server-sdk';
import { prisma } from './db';
import { createLogger } from './logger';

const log = createLogger('notifications');

// Singleton Expo SDK client
const expo = new Expo();

// ─── Types ───────────────────────────────────────────────────────

export interface NotificationPayload {
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default' | null;
  badge?: number;
  channelId?: string;
}

export interface SendResult {
  sent: number;
  failed: number;
  invalidTokensRemoved: string[];
  errors: Array<{ token: string; error: string }>;
}

// ─── Core Send Function ─────────────────────────────────────────

/**
 * Sends push notifications to an array of Expo push tokens.
 *
 * - Filters out invalid token formats before sending
 * - Chunks messages per Expo API limits (automatic via SDK)
 * - Inspects every ticket for errors
 * - Removes DeviceNotRegistered tokens from the database
 * - Never throws — always returns a structured result
 */
export async function sendPushNotifications(
  tokens: string[],
  payload: NotificationPayload
): Promise<SendResult> {
  const result: SendResult = {
    sent: 0,
    failed: 0,
    invalidTokensRemoved: [],
    errors: [],
  };

  if (!tokens.length) {
    return result;
  }

  // Pre-validate token format
  const validTokens: string[] = [];
  for (const token of tokens) {
    if (!Expo.isExpoPushToken(token)) {
      log.warn({ token }, 'Skipping invalid Expo push token format');
      result.failed++;
      result.errors.push({ token, error: 'invalid_token_format' });
      continue;
    }
    validTokens.push(token);
  }

  if (!validTokens.length) {
    return result;
  }

  // Build messages
  const messages: ExpoPushMessage[] = validTokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
    sound: payload.sound ?? 'default',
    ...(payload.badge !== undefined && { badge: payload.badge }),
    ...(payload.channelId && { channelId: payload.channelId }),
  }));

  // Chunk and send — the SDK handles batching into ≤100-message chunks
  const chunks = expo.chunkPushNotifications(messages);
  const tokensToRemove: string[] = [];

  for (const chunk of chunks) {
    let tickets: ExpoPushTicket[];
    try {
      tickets = await expo.sendPushNotificationsAsync(chunk);
    } catch (err) {
      // Entire chunk failed (network error, Expo API down, etc.)
      log.error({ err, chunkSize: chunk.length }, 'Expo push chunk failed entirely');
      result.failed += chunk.length;
      for (const msg of chunk) {
        const token = typeof msg.to === 'string' ? msg.to : msg.to[0];
        result.errors.push({ token, error: 'chunk_send_failed' });
      }
      continue;
    }

    // Inspect each ticket
    for (let i = 0; i < tickets.length; i++) {
      const ticket = tickets[i];
      const token = typeof chunk[i].to === 'string'
        ? (chunk[i].to as string)
        : (chunk[i].to as string[])[0];

      if (ticket.status === 'ok') {
        result.sent++;
        log.debug({ token, ticketId: (ticket as ExpoPushSuccessTicket).id }, 'Push sent');
      } else {
        // ticket.status === 'error'
        const errorTicket = ticket as ExpoPushErrorTicket;
        result.failed++;
        result.errors.push({ token, error: errorTicket.details?.error ?? errorTicket.message });

        log.warn(
          {
            token,
            errorCode: errorTicket.details?.error,
            message: errorTicket.message,
          },
          'Push ticket error'
        );

        // Mark token for removal if device is no longer registered
        if (errorTicket.details?.error === 'DeviceNotRegistered') {
          tokensToRemove.push(token);
        }
      }
    }
  }

  // Remove invalid tokens from the database
  if (tokensToRemove.length > 0) {
    await removeInvalidTokens(tokensToRemove);
    result.invalidTokensRemoved.push(...tokensToRemove);
  }

  log.info(
    {
      sent: result.sent,
      failed: result.failed,
      invalidRemoved: result.invalidTokensRemoved.length,
    },
    'Push notification batch complete'
  );

  return result;
}

// ─── Token Cleanup ───────────────────────────────────────────────

/**
 * Nullifies expoPushToken for users whose tokens are no longer valid.
 * Uses a single UPDATE ... WHERE IN for efficiency.
 */
async function removeInvalidTokens(tokens: string[]): Promise<void> {
  try {
    const { count } = await prisma.user.updateMany({
      where: { expoPushToken: { in: tokens } },
      data: { expoPushToken: null },
    });
    log.info({ tokens, removedCount: count }, 'Removed invalid Expo push tokens');
  } catch (err) {
    // Log but don't propagate — caller already has the result
    log.error({ err, tokens }, 'Failed to remove invalid Expo push tokens from DB');
  }
}

// ─── Trade Notification Helper ───────────────────────────────────

/**
 * Sends trade notifications to a user's followers.
 *
 * Called after a trade is successfully created.
 * Fetches followers with notifications enabled, extracts valid tokens,
 * and delegates to sendPushNotifications.
 *
 * This function NEVER throws. All errors are caught and logged.
 */
export async function notifyFollowersOfTrade(
  traderId: string,
  tradeDetails: {
    displayName: string | null;
    marketTicker: string;
    side: string;
    action: string;
    amount: string;
  }
): Promise<SendResult | null> {
  try {
    // Fetch followers who have notifications enabled and have a push token
    const followers = await prisma.follow.findMany({
      where: { followingId: traderId },
      select: {
        follower: {
          select: {
            expoPushToken: true,
            tradeNotificationsEnabled: true,
          },
        },
      },
    });

    // Extract tokens for followers with notifications enabled
    const tokens: string[] = [];
    for (const f of followers) {
      if (f.follower.tradeNotificationsEnabled && f.follower.expoPushToken) {
        tokens.push(f.follower.expoPushToken);
      }
    }

    if (tokens.length === 0) {
      log.debug({ traderId }, 'No followers with push tokens to notify');
      return null;
    }

    const traderName = tradeDetails.displayName || 'A trader you follow';
    const actionVerb = tradeDetails.action === 'SELL' ? 'sold' : 'bought';

    const payload: NotificationPayload = {
      title: `${traderName} placed a trade`,
      body: `${traderName} ${actionVerb} ${tradeDetails.side.toUpperCase()} on ${tradeDetails.marketTicker}`,
      data: {
        type: 'trade',
        traderId,
        marketTicker: tradeDetails.marketTicker,
      },
      channelId: 'trades',
    };

    return await sendPushNotifications(tokens, payload);
  } catch (err) {
    log.error({ err, traderId }, 'Failed to notify followers of trade');
    return null;
  }
}
