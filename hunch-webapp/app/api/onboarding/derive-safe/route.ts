import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';
import { deriveSafe as sdkDeriveSafe } from '@polymarket/builder-relayer-client/dist/builder/derive';
import { getContractConfig } from '@polymarket/builder-relayer-client/dist/config';

const POLYGON_CHAIN_ID = 137;

/**
 * Derive Safe address using the official Polymarket SDK.
 * This ensures the derived address matches what the RelayClient expects.
 */
function deriveSafe(eoaAddress: string): string {
    const config = getContractConfig(POLYGON_CHAIN_ID);
    return sdkDeriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
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
