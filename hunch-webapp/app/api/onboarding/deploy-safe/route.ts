import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';

/**
 * POST /api/onboarding/deploy-safe
 *
 * Step 2 of Polymarket wallet onboarding.
 * The client has already called RelayClient.deploy() and is reporting
 * the result. We just record success on the user record.
 *
 * Body: { success: boolean, transactionHash?: string }
 *
 * Idempotent: if already deployed, returns early.
 *
 * Returns: { success: true, safeAddress: string }
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                safeAddress: true,
                safeDeployed: true,
                polymarketOnboardingStep: true,
            },
        });

        // Guard: Safe must be derived first (step >= 1)
        if (!user?.safeAddress || !user.polymarketOnboardingStep || user.polymarketOnboardingStep < 1) {
            return NextResponse.json(
                { error: 'Safe address must be derived first. Call /api/onboarding/derive-safe.' },
                { status: 400 }
            );
        }

        // Idempotent: already deployed
        if (user.safeDeployed) {
            return NextResponse.json({
                success: true,
                safeAddress: user.safeAddress,
                alreadyDeployed: true,
            });
        }

        const body = await request.json();
        const { success, transactionHash } = body;

        if (!success) {
            return NextResponse.json(
                { error: 'Client reported deploy failure' },
                { status: 400 }
            );
        }

        // Record deployment success
        await prisma.user.update({
            where: { id: authUser.userId },
            data: {
                safeDeployed: true,
                polymarketOnboardingStep: 2,
            },
        });

        console.log(`[deploy-safe] Safe deployed for user ${authUser.userId} (Safe: ${user.safeAddress}, tx: ${transactionHash || 'n/a'})`);

        return NextResponse.json({
            success: true,
            safeAddress: user.safeAddress,
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /onboarding/deploy-safe] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to record Safe deployment' },
            { status: 500 }
        );
    }
}
