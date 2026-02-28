import {
  createAssociatedTokenAccountIdempotentInstruction,
  createTransferInstruction,
  getAssociatedTokenAddress,
  TOKEN_PROGRAM_ID,
} from '@solana/spl-token';
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from '@solana/web3.js';
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import {
  AuthError,
  createAuthErrorResponse,
  getAuthenticatedUser,
} from '@/app/lib/authMiddleware';
import { sendPushNotifications } from '@/app/lib/notificationService';
import { createLogger } from '@/app/lib/logger';

const log = createLogger('send-usdc');

const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_DECIMALS = 6;

type RequestType = 'send' | 'withdraw';

function normalizeType(value: unknown): RequestType | null {
  if (value === undefined || value === null || value === '') return 'send';
  if (value === 'send' || value === 'withdraw') return value;
  return null;
}

async function getLatestBlockhashWithFallback() {
  const configuredUrl = process.env.SOLANA_RPC_URL?.trim();
  const rpcUrls = [
    configuredUrl,
    'https://api.mainnet-beta.solana.com',
    'https://solana-mainnet.g.alchemy.com/v2/demo',
  ].filter((url): url is string => Boolean(url));

  let lastError: unknown = null;
  for (const rpcUrl of rpcUrls) {
    try {
      const connection = new Connection(rpcUrl, 'confirmed');
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
      return { blockhash, lastValidBlockHeight, rpcUrl };
    } catch (error) {
      lastError = error;
      log.warn({ err: error, rpcUrl }, 'RPC failed while fetching latest blockhash');
    }
  }

  throw lastError ?? new Error('Unable to fetch recent blockhash from configured RPC endpoints');
}

export async function POST(request: NextRequest) {
  try {
    const authUser = await getAuthenticatedUser(request);

    const body = await request.json();
    const {
      fromAddress,
      toAddress,
      amount,
      type: rawType,
      senderName,
    } = body as {
      fromAddress?: unknown;
      toAddress?: unknown;
      amount?: unknown;
      type?: unknown;
      senderName?: unknown;
    };

    const type = normalizeType(rawType);
    if (!type) {
      return NextResponse.json({ error: "type must be 'send' or 'withdraw'" }, { status: 400 });
    }

    if (typeof fromAddress !== 'string' || !fromAddress.trim()) {
      return NextResponse.json({ error: 'fromAddress is required' }, { status: 400 });
    }
    const normalizedFromAddress = fromAddress.trim();

    if (normalizedFromAddress !== authUser.walletAddress) {
      return NextResponse.json({ error: 'fromAddress does not match authenticated wallet' }, { status: 403 });
    }

    if (typeof toAddress !== 'string' || !toAddress.trim()) {
      return NextResponse.json({ error: 'toAddress is required' }, { status: 400 });
    }
    const normalizedToAddress = toAddress.trim();

    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }

    let from: PublicKey;
    let to: PublicKey;
    try {
      from = new PublicKey(normalizedFromAddress);
      to = new PublicKey(normalizedToAddress);
    } catch {
      return NextResponse.json({ error: 'Invalid Solana wallet address' }, { status: 400 });
    }

    const fromATA = await getAssociatedTokenAddress(USDC_MINT, from);
    const toATA = await getAssociatedTokenAddress(USDC_MINT, to);
    const instructions: TransactionInstruction[] = [];

    // Idempotent ATA creation avoids extra RPC account existence checks.
    instructions.push(
      createAssociatedTokenAccountIdempotentInstruction(
        from,
        toATA,
        to,
        USDC_MINT
      )
    );

    const rawAmount = Math.round(amount * Math.pow(10, USDC_DECIMALS));
    if (!Number.isSafeInteger(rawAmount) || rawAmount <= 0) {
      return NextResponse.json({ error: 'Invalid amount precision or range' }, { status: 400 });
    }

    instructions.push(
      createTransferInstruction(
        fromATA,
        toATA,
        from,
        rawAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    const { blockhash, lastValidBlockHeight } = await getLatestBlockhashWithFallback();
    const message = new TransactionMessage({
      payerKey: from,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message();

    const transaction = new VersionedTransaction(message);
    const serialized = Buffer.from(transaction.serialize()).toString('base64');

    if (type === 'send') {
      try {
        const recipient = await prisma.user.findUnique({
          where: { walletAddress: normalizedToAddress },
          select: { expoPushToken: true },
        });

        if (recipient?.expoPushToken) {
          const displayAmount = Number(amount).toFixed(2);
          const fromLabel =
            typeof senderName === 'string' && senderName.trim() ? senderName.trim() : 'Someone';

          await sendPushNotifications(
            [recipient.expoPushToken],
            {
              title: 'You received USDC!',
              body: `${fromLabel} sent you $${displayAmount} USDC`,
              data: {
                type: 'usdc_received',
                fromAddress: normalizedFromAddress,
                amount: displayAmount,
              },
              channelId: 'trades',
            }
          );
        }
      } catch (notifError) {
        log.error({ err: notifError, toAddress }, 'Push notification failed');
      }
    }

    return NextResponse.json({ transaction: serialized, lastValidBlockHeight }, { status: 200 });
  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
    }
    log.error({ err: error }, 'Failed to build send-usdc transaction');
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
