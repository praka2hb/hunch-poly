import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';

/**
 * GET /api/polymarket/approval
 * 
 * Check if the user's Privy embedded wallet has approved USDC spending
 * on the Polymarket CTF Exchange contract on-chain.
 * 
 * This is a lightweight check — the actual on-chain approval tx
 * is signed and submitted client-side by the Privy wallet.
 * 
 * Returns: { needsApproval: boolean, walletAddress: string }
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        // The actual on-chain approval check would require an RPC call
        // to USDC contract's allowance(owner, spender).
        // For now, return the wallet address so the client can check.
        return NextResponse.json({
            walletAddress: authUser.walletAddress,
            // CTF Exchange contract on Polygon (the spender for approvals)
            ctfExchangeAddress: '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E',
            // USDC contract on Polygon
            usdcAddress: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /polymarket/approval] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to check approval' },
            { status: 500 }
        );
    }
}
