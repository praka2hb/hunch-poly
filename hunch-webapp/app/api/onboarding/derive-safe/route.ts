import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';
import { ethers } from 'ethers';

// Polymarket Safe factory constants (Polygon mainnet)
const SAFE_FACTORY = '0xaacFeEa03eb1561C4e67d661e40682Bd20E3541b';
const SAFE_INIT_CODE_HASH = '0x2bce2127ff07fb632d16c8347c4ebf501f4841168bed00d9e6ef715ddb6fcecf';

/**
 * Deterministically derive a Polymarket Safe address from an EOA
 * using CREATE2 (same formula the RelayClient uses internally).
 */
function deriveSafe(eoaAddress: string): string {
    const salt = ethers.utils.keccak256(
        ethers.utils.defaultAbiCoder.encode(['address'], [eoaAddress])
    );
    return ethers.utils.getCreate2Address(SAFE_FACTORY, salt, SAFE_INIT_CODE_HASH);
}

/**
 * POST /api/onboarding/derive-safe
 *
 * Step 1 of Polymarket wallet onboarding.
 * Deterministically derive the user's Gnosis Safe address from their
 * Privy EOA. No signature required — pure computation.
 *
 * Idempotent: if already derived, returns the existing address.
 *
 * Returns: { safeAddress: string }
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        // Check if already derived (idempotent)
        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: { safeAddress: true, polymarketOnboardingStep: true },
        });

        if (user?.polymarketOnboardingStep && user.polymarketOnboardingStep >= 1 && user.safeAddress) {
            return NextResponse.json({
                safeAddress: user.safeAddress,
                alreadyDerived: true,
            });
        }

        // Derive Safe address deterministically from EOA
        const safeAddress = deriveSafe(authUser.walletAddress);

        if (!safeAddress) {
            console.error('[derive-safe] Failed to derive Safe address for wallet:', authUser.walletAddress);
            return NextResponse.json(
                { error: 'Failed to derive Safe address' },
                { status: 500 }
            );
        }

        // Store on user and advance onboarding step
        await prisma.user.update({
            where: { id: authUser.userId },
            data: {
                safeAddress,
                polymarketOnboardingStep: 1,
            },
        });

        console.log(`[derive-safe] Derived Safe ${safeAddress} for user ${authUser.userId} (EOA: ${authUser.walletAddress})`);

        return NextResponse.json({ safeAddress });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /onboarding/derive-safe] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to derive Safe address' },
            { status: 500 }
        );
    }
}
