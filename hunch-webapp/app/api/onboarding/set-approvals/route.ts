import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';

/**
 * POST /api/onboarding/set-approvals
 *
 * Step 3 of Polymarket wallet onboarding.
 * The client has already called RelayClient.execute() with the 7
 * approval transactions and is reporting the result.
 *
 * Body: { success: boolean, transactionHash?: string }
 *
 * Idempotent: if already approved, returns early.
 *
 * Returns: { success: true }
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                safeDeployed: true,
                approvalsSet: true,
                polymarketOnboardingStep: true,
            },
        });

        // Guard: Safe must be deployed first (step >= 2)
        if (!user?.safeDeployed || !user.polymarketOnboardingStep || user.polymarketOnboardingStep < 2) {
            return NextResponse.json(
                { error: 'Safe must be deployed first. Call /api/onboarding/deploy-safe.' },
                { status: 400 }
            );
        }

        // Idempotent: already approved
        if (user.approvalsSet) {
            return NextResponse.json({
                success: true,
                alreadyApproved: true,
            });
        }

        const body = await request.json();
        const { success, transactionHash } = body;

        if (!success) {
            return NextResponse.json(
                { error: 'Client reported approval failure' },
                { status: 400 }
            );
        }

        // Record approval success
        await prisma.user.update({
            where: { id: authUser.userId },
            data: {
                approvalsSet: true,
                polymarketOnboardingStep: 3,
            },
        });

        console.log(`[set-approvals] Approvals set for user ${authUser.userId} (tx: ${transactionHash || 'n/a'})`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /onboarding/set-approvals] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to record approvals' },
            { status: 500 }
        );
    }
}
