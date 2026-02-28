import { NextRequest, NextResponse } from 'next/server';
import {
    advanceOnboardingStep,
    OnboardingError,
} from '@/app/lib/onboardingService';
import {
    getAuthenticatedUser,
    AuthError,
    createAuthErrorResponse,
} from '@/app/lib/authMiddleware';

/**
 * POST /api/users/onboarding/progress
 *
 * Authenticated endpoint to save/advance onboarding progress.
 */
export async function POST(request: NextRequest) {
    try {
        // Authenticate
        let authUser;
        try {
            authUser = await getAuthenticatedUser(request);
        } catch (error) {
            if (error instanceof AuthError) {
                return NextResponse.json(
                    createAuthErrorResponse(error),
                    { status: error.statusCode }
                );
            }
            throw error;
        }

        const body = await request.json();
        const { step, completed } = body;

        if (!step || typeof step !== 'string') {
            return NextResponse.json(
                { error: 'step is required.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const result = await advanceOnboardingStep(authUser.userId, { step, completed });

        return NextResponse.json(result, { status: 200 });
    } catch (error: unknown) {
        if (error instanceof OnboardingError) {
            return NextResponse.json(
                { error: error.message, code: error.code },
                { status: error.statusCode }
            );
        }

        console.error('[onboarding/progress] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
