import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';
import { decrypt } from '@/app/lib/encryption';
import crypto from 'crypto';

// Polymarket CLOB API base URL
const CLOB_BASE_URL = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';

/**
 * Build HMAC-SHA256 authentication headers for Polymarket CLOB L2 API.
 * These are required on every CLOB request.
 */
function buildClobHeaders(
    apiKey: string,
    secret: string,
    passphrase: string,
    method: string,
    path: string,
    body: string = ''
): Record<string, string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const message = timestamp + method.toUpperCase() + path + body;
    const hmac = crypto.createHmac('sha256', Buffer.from(secret, 'base64'));
    hmac.update(message);
    const signature = hmac.digest('base64');

    return {
        'Content-Type': 'application/json',
        'POLY_API_KEY': apiKey,
        'POLY_SIGNATURE': signature,
        'POLY_TIMESTAMP': timestamp,
        'POLY_PASSPHRASE': passphrase,
    };
}

/**
 * POST /api/polymarket/order
 * 
 * Relay a signed order to the Polymarket CLOB API.
 * 
 * The client creates and EIP-712 signs the order payload using the user's
 * Privy embedded wallet. The backend then posts the signed order to the
 * CLOB using the user's stored L2 API credentials for authentication.
 * 
 * Body: {
 *   order: object,         // The signed order payload (EIP-712 signed by Privy wallet)
 *   conditionId: string,   // Market condition ID (for our records)
 *   tokenId: string,       // Token ID being traded
 *   side: "BUY" | "SELL",  // Trade direction
 *   marketTitle?: string,  // Optional market title for feed display
 * }
 * 
 * Returns: CLOB order response + our trade record ID
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        // Get user's CLOB credentials
        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                clobApiKey: true,
                clobApiSecret: true,
                clobApiPassphrase: true,
                walletAddress: true,
            },
        });

        if (!user?.clobApiKey || !user?.clobApiSecret || !user?.clobApiPassphrase) {
            return NextResponse.json(
                { error: 'CLOB API credentials not set up. Call /api/polymarket/derive-key first.' },
                { status: 400 }
            );
        }

        // Decrypt credentials (stored encrypted via AES-256-GCM)
        const apiKey = decrypt(user.clobApiKey);
        const apiSecret = decrypt(user.clobApiSecret);
        const apiPassphrase = decrypt(user.clobApiPassphrase);

        const body = await request.json();
        const { order, conditionId, tokenId, side, marketTitle } = body;

        if (!order) {
            return NextResponse.json(
                { error: 'Signed order payload is required' },
                { status: 400 }
            );
        }

        // Post the signed order to CLOB
        const orderBody = JSON.stringify(order);
        const clobPath = '/order';
        const headers = buildClobHeaders(
            apiKey,
            apiSecret,
            apiPassphrase,
            'POST',
            clobPath,
            orderBody
        );

        const clobResponse = await fetch(`${CLOB_BASE_URL}${clobPath}`, {
            method: 'POST',
            headers,
            body: orderBody,
            signal: AbortSignal.timeout(15000),
        });

        if (!clobResponse.ok) {
            const errorText = await clobResponse.text();
            console.error('[order] CLOB order placement failed:', {
                status: clobResponse.status,
                error: errorText,
                wallet: user.walletAddress,
            });
            return NextResponse.json(
                { error: `CLOB order failed: ${clobResponse.status}`, details: errorText },
                { status: 502 }
            );
        }

        const clobData = await clobResponse.json();

        // Create a Trade record in our DB for social feed tracking
        const trade = await prisma.trade.create({
            data: {
                userId: authUser.userId,
                marketTicker: conditionId || '',
                provider: 'polymarket',
                side: side === 'BUY' ? 'yes' : 'no',
                action: side || 'BUY',
                amount: String(order.size || order.amount || '0'),
                transactionSig: clobData.orderID || clobData.transactionsHashes?.[0] || '',
                externalOrderId: clobData.orderID || null,
                quote: JSON.stringify(clobData),
                conditionId: conditionId || null,
                tokenId: tokenId || null,
                orderStatus: clobData.status || 'LIVE',
                marketTitle: marketTitle || null,
                walletAddress: user.walletAddress,
                entryPrice: order.price ? parseFloat(order.price) : null,
            },
        });

        console.log(`[order] Order placed for user ${authUser.userId}:`, {
            tradeId: trade.id,
            clobOrderId: clobData.orderID,
            conditionId,
            side,
        });

        return NextResponse.json({
            success: true,
            tradeId: trade.id,
            clobResponse: clobData,
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /polymarket/order] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to place order' },
            { status: 500 }
        );
    }
}
