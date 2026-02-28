import { NextRequest, NextResponse } from 'next/server';
import { claimUsername } from '@/app/lib/onboardingService';
import {
    getAuthenticatedUser,
    AuthError,
    createAuthErrorResponse,
} from '@/app/lib/authMiddleware';

/**
 * POST /api/users/username/claim
 *
 * Authenticated endpoint to atomically claim a username.
 * Race conditions are solved here via a Prisma transaction.
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
        const { username } = body;

        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            return NextResponse.json(
                { error: 'username is required.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const result = await claimUsername(authUser.userId, username);

        if (!result.success) {
            // Determine status code from error code
            const statusCode = result.code === 'TAKEN' ? 409
                : result.code === 'USER_NOT_FOUND' ? 404
                    : 400;

            return NextResponse.json(
                { error: result.error, code: result.code },
                { status: statusCode }
            );
        }

        return NextResponse.json(
            {
                user: result.user,
                onboardingStep: result.onboardingStep,
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        console.error('[username/claim] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
