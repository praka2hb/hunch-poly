import { NextRequest, NextResponse } from 'next/server';
import { checkUsernameAvailability } from '@/app/lib/onboardingService';
import { getReasonMessage } from '@/app/lib/usernameValidator';

/**
 * GET /api/users/username/check?username=<value>
 *
 * Public endpoint to check username availability.
 * Validates format + reserved words + database uniqueness.
 */
export async function GET(request: NextRequest) {
    try {
        const { searchParams } = new URL(request.url);
        const username = searchParams.get('username');

        if (!username || typeof username !== 'string' || username.trim().length === 0) {
            return NextResponse.json(
                { error: 'username query parameter is required.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const result = await checkUsernameAvailability(username);

        return NextResponse.json(
            {
                username: result.username,
                normalizedUsername: result.normalizedUsername,
                available: result.available,
                reason: result.reason,
                message: result.reason ? getReasonMessage(result.reason) : undefined,
            },
            { status: 200 }
        );
    } catch (error: unknown) {
        console.error('[username/check] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
