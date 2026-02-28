import { NextRequest, NextResponse } from 'next/server';
import {
    createOrUpdateCopySettings,
    getCopySettings,
    deleteCopySettings,
    getCopySettingsForFollower,
} from '@/app/lib/copySettingsService';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { hasValidDelegation } from '@/app/lib/delegationService';

// POST - Create or update copy settings
export async function POST(request: NextRequest) {
    try {
        // SECURITY: Get followerId from authenticated Privy session, not from body
        const authUser = await getAuthenticatedUser(request);
        const followerId = authUser.userId;

        const body = await request.json();
        const { leaderId, amountPerTrade, maxTotalAmount, expiresAt } = body;

        console.log('POST /api/copy-settings - Request:', { followerId, leaderId, amountPerTrade, maxTotalAmount });

        if (!leaderId) {
            return NextResponse.json(
                { error: 'leaderId is required' },
                { status: 400 }
            );
        }

        if (typeof amountPerTrade !== 'number' || amountPerTrade <= 0) {
            return NextResponse.json(
                { error: 'amountPerTrade must be a positive number' },
                { status: 400 }
            );
        }

        if (typeof maxTotalAmount !== 'number' || maxTotalAmount <= 0) {
            return NextResponse.json(
                { error: 'maxTotalAmount must be a positive number' },
                { status: 400 }
            );
        }

        if (amountPerTrade > maxTotalAmount) {
            return NextResponse.json(
                { error: 'amountPerTrade cannot exceed maxTotalAmount' },
                { status: 400 }
            );
        }

        // SECURITY: Check if follower has CLOB credentials set up
        const hasDelegation = await hasValidDelegation(followerId);

        if (!hasDelegation) {
            return NextResponse.json(
                {
                    error: 'Copy trading requires CLOB credentials. Please set up your trading account first.',
                    code: 'CLOB_CREDENTIALS_REQUIRED',
                },
                { status: 403 }
            );
        }

        const copySettings = await createOrUpdateCopySettings(followerId, leaderId, {
            followerId,
            leaderId,
            amountPerTrade,
            maxTotalAmount,
            expiresAt: expiresAt ? new Date(expiresAt) : null,
            // Note: We no longer store delegation in CopySettings, it's on User model now
            delegationSignature: null,
            signedMessage: null,
            signedAt: null,
        });

        console.log('POST /api/copy-settings - Success:', copySettings.id);
        return NextResponse.json(copySettings, { status: 200 });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('Error creating/updating copy settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to create/update copy settings' },
            { status: 500 }
        );
    }
}

// GET - Get copy settings
export async function GET(request: NextRequest) {
    try {
        // SECURITY: Get followerId from authenticated Privy session for follower-scoped queries
        const authUser = await getAuthenticatedUser(request);
        const followerId = authUser.userId;

        const { searchParams } = new URL(request.url);
        const leaderId = searchParams.get('leaderId');

        console.log('GET /api/copy-settings - Params:', { followerId, leaderId });

        // If leaderId is provided, get specific settings
        if (leaderId) {
            const copySettings = await getCopySettings(followerId, leaderId);
            return NextResponse.json(copySettings || null, { status: 200 });
        }

        // Otherwise, get all copy settings for the follower
        const allSettings = await getCopySettingsForFollower(followerId);
        return NextResponse.json(allSettings, { status: 200 });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('Error fetching copy settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to fetch copy settings' },
            { status: 500 }
        );
    }
}

// DELETE - Delete copy settings
export async function DELETE(request: NextRequest) {
    try {
        // SECURITY: Get followerId from authenticated Privy session, not from body
        const authUser = await getAuthenticatedUser(request);
        const followerId = authUser.userId;

        const body = await request.json();
        const { leaderId } = body;

        console.log('DELETE /api/copy-settings - Request:', { followerId, leaderId });

        if (!leaderId) {
            return NextResponse.json(
                { error: 'leaderId is required' },
                { status: 400 }
            );
        }

        const result = await deleteCopySettings(followerId, leaderId);
        console.log('DELETE /api/copy-settings - Success');
        return NextResponse.json(result, { status: 200 });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('Error deleting copy settings:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to delete copy settings' },
            { status: 500 }
        );
    }
}
