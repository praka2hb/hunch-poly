import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/app/lib/db';
import {
    getAuthenticatedUser,
    AuthError,
    createAuthErrorResponse,
} from '@/app/lib/authMiddleware';

/**
 * GET /api/users/[userId]/preferences
 *
 * Fetch user preferences (authenticated).
 * User can only fetch their own preferences.
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
    try {
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

        const { userId } = await params;

        if (authUser.userId !== userId) {
            return NextResponse.json(
                { error: 'You can only fetch your own preferences.', code: 'FORBIDDEN' },
                { status: 403 }
            );
        }

        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, preferences: true },
        });

        if (!user) {
            return NextResponse.json(
                { error: 'User not found.', code: 'NOT_FOUND' },
                { status: 404 }
            );
        }

        return NextResponse.json(user, { status: 200 });
    } catch (error: unknown) {
        console.error('[preferences:get] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}

/**
 * POST /api/users/[userId]/preferences
 *
 * Update user preferences (authenticated).
 * User can only update their own preferences.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ userId: string }> }
) {
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

        const { userId } = await params;

        // Verify user is updating their own preferences
        if (authUser.userId !== userId) {
            return NextResponse.json(
                { error: 'You can only update your own preferences.', code: 'FORBIDDEN' },
                { status: 403 }
            );
        }

        const body = await request.json();
        const { preferences } = body;

        if (!Array.isArray(preferences)) {
            return NextResponse.json(
                { error: 'preferences must be an array of strings.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        // Validate all items are strings
        if (!preferences.every((p) => typeof p === 'string')) {
            return NextResponse.json(
                { error: 'All preferences must be strings.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        // Update preferences
        const updatedUser = await prisma.user.update({
            where: { id: userId },
            data: { preferences },
            select: {
                id: true,
                preferences: true,
            },
        });

        return NextResponse.json(updatedUser, { status: 200 });
    } catch (error: unknown) {
        console.error('[preferences] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
