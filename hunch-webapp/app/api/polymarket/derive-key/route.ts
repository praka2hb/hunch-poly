import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';

// Polymarket CLOB API base URL
const CLOB_BASE_URL = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';

/**
 * POST /api/polymarket/derive-key
 * 
 * Derive Polymarket CLOB API credentials for the authenticated user's wallet.
 * 
 * The client must provide the EIP-712 signature from the user's Privy wallet.
 * This signature is used server-side to create/derive CLOB API keys via Polymarket's
 * /auth/api-key endpoint.
 * 
 * Body: {
 *   signature: string,  // EIP-712 signature from Privy wallet
 *   timestamp: string,   // Unix timestamp used in the signed message
 *   nonce: number        // Nonce used in the signed message (0 for new keys)
 * }
 * 
 * Returns: { success: true, apiKey: string }
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        // Check if user already has CLOB credentials
        const existingUser = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: { clobApiKey: true },
        });

        if (existingUser?.clobApiKey) {
            return NextResponse.json({
                success: true,
                alreadyDerived: true,
                message: 'CLOB API credentials already exist for this wallet',
            });
        }

        const body = await request.json();
        const { signature, timestamp, nonce } = body;

        if (!signature || !timestamp) {
            return NextResponse.json(
                { error: 'signature and timestamp are required' },
                { status: 400 }
            );
        }

        // Call Polymarket's CLOB auth endpoint to create API key
        // POST /auth/api-key
        const clobResponse = await fetch(`${CLOB_BASE_URL}/auth/api-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                address: authUser.walletAddress,
                signature,
                timestamp,
                nonce: nonce ?? 0,
            }),
            signal: AbortSignal.timeout(15000),
        });

        if (!clobResponse.ok) {
            const errorText = await clobResponse.text();
            console.error('[derive-key] CLOB API key creation failed:', {
                status: clobResponse.status,
                error: errorText,
                wallet: authUser.walletAddress,
            });
            return NextResponse.json(
                { error: `Failed to derive CLOB API key: ${clobResponse.status}` },
                { status: 502 }
            );
        }

        const clobData = await clobResponse.json();
        const { apiKey, secret, passphrase } = clobData;

        if (!apiKey || !secret || !passphrase) {
            console.error('[derive-key] Unexpected CLOB response:', clobData);
            return NextResponse.json(
                { error: 'Unexpected response from CLOB API' },
                { status: 502 }
            );
        }

        // Store credentials on user record
        await prisma.user.update({
            where: { id: authUser.userId },
            data: {
                clobApiKey: apiKey,
                clobApiSecret: secret,
                clobApiPassphrase: passphrase,
            },
        });

        console.log(`[derive-key] Stored CLOB credentials for user ${authUser.userId} (wallet: ${authUser.walletAddress})`);

        return NextResponse.json({
            success: true,
            apiKey, // Return the API key so client knows it succeeded
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /polymarket/derive-key] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to derive CLOB API key' },
            { status: 500 }
        );
    }
}
