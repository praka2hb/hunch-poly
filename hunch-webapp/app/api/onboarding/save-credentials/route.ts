import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedUser, AuthError, createAuthErrorResponse } from '@/app/lib/authMiddleware';
import { prisma } from '@/app/lib/db';
import { encrypt } from '@/app/lib/encryption';

/**
 * POST /api/onboarding/save-credentials
 *
 * Step 4 (final) of Polymarket wallet onboarding.
 * The client has derived CLOB API credentials via ClobClient.deriveApiKey()
 * or createApiKey() and sends them here for encrypted storage.
 *
 * Body: { key: string, secret: string, passphrase: string }
 *
 * Returns: { success: true }
 */
export async function POST(request: NextRequest) {
    try {
        const authUser = await getAuthenticatedUser(request);

        const user = await prisma.user.findUnique({
            where: { id: authUser.userId },
            select: {
                approvalsSet: true,
                polymarketOnboardingStep: true,
                clobApiKey: true,
            },
        });

        // Guard: approvals must be set first (step >= 3)
        if (!user?.approvalsSet || !user.polymarketOnboardingStep || user.polymarketOnboardingStep < 3) {
            return NextResponse.json(
                { error: 'Approvals must be set first. Call /api/onboarding/set-approvals.' },
                { status: 400 }
            );
        }

        // Idempotent: credentials already saved
        if (user.clobApiKey && user.polymarketOnboardingStep >= 4) {
            return NextResponse.json({
                success: true,
                alreadySaved: true,
            });
        }

        const body = await request.json();
        const { key, secret, passphrase } = body;

        if (!key || typeof key !== 'string' || !key.trim()) {
            return NextResponse.json({ error: 'key is required' }, { status: 400 });
        }
        if (!secret || typeof secret !== 'string' || !secret.trim()) {
            return NextResponse.json({ error: 'secret is required' }, { status: 400 });
        }
        if (!passphrase || typeof passphrase !== 'string' || !passphrase.trim()) {
            return NextResponse.json({ error: 'passphrase is required' }, { status: 400 });
        }

        // Encrypt before storing
        const encryptedKey = encrypt(key.trim());
        const encryptedSecret = encrypt(secret.trim());
        const encryptedPassphrase = encrypt(passphrase.trim());

        await prisma.user.update({
            where: { id: authUser.userId },
            data: {
                clobApiKey: encryptedKey,
                clobApiSecret: encryptedSecret,
                clobApiPassphrase: encryptedPassphrase,
                polymarketCredentialsCreatedAt: new Date(),
                polymarketOnboardingStep: 4,
            },
        });

        console.log(`[save-credentials] Polymarket credentials saved for user ${authUser.userId}`);

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error instanceof AuthError) {
            return NextResponse.json(createAuthErrorResponse(error), { status: error.statusCode });
        }
        console.error('[API /onboarding/save-credentials] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to save credentials' },
            { status: 500 }
        );
    }
}
