import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';

/**
 * GET /api/onboarding/status
 *
 * Returns the current Polymarket onboarding state for the authenticated user.
 * The Expo app calls this on mount to determine which step to resume from.
 *
 * Returns: {
 *   step: number,          // 0-4
 *   safeAddress: string | null,
 *   safeDeployed: boolean,
 *   approvalsSet: boolean,
 *   credentialsReady: boolean
 * }
 */
export async function GET(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                safeAddress: true,
                safeDeployed: true,
                approvalsSet: true,
                clobApiKey: true,
                polymarketOnboardingStep: true,
            },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            step: user.polymarketOnboardingStep ?? 0,
            safeAddress: user.safeAddress,
            safeDeployed: user.safeDeployed,
            approvalsSet: user.approvalsSet,
            credentialsReady: !!user.clobApiKey,
        });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /onboarding/status] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to get onboarding status' },
            { status: 500 }
        );
    }
}
