import { NextRequest, NextResponse } from 'next/server';
import { bootstrapOAuthUser } from '@/app/lib/onboardingService';

/**
 * POST /api/auth/bootstrap-oauth-user
 *
 * Idempotent endpoint called after OAuth sign-in.
 * Creates/updates user and returns canonical onboarding state.
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { privyId, provider, linkedAccounts, username, displayName } = body;

        // Validate required fields
        if (!privyId || typeof privyId !== 'string') {
            return NextResponse.json(
                { error: 'privyId is required.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        if (!provider || typeof provider !== 'string') {
            return NextResponse.json(
                { error: 'provider is required (e.g. "apple", "twitter").', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        if (!Array.isArray(linkedAccounts)) {
            return NextResponse.json(
                { error: 'linkedAccounts must be an array.', code: 'VALIDATION_ERROR' },
                { status: 400 }
            );
        }

        const result = await bootstrapOAuthUser({
            privyId,
            provider,
            linkedAccounts,
            username,
            displayName,
        });

        return NextResponse.json(result, { status: 200 });
    } catch (error: unknown) {
        console.error('[bootstrap-oauth-user] Error:', error);
        return NextResponse.json(
            {
                error: error instanceof Error ? error.message : 'Internal server error.',
                code: 'INTERNAL_ERROR',
            },
            { status: 500 }
        );
    }
}
