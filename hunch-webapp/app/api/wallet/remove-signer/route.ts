import { NextRequest, NextResponse } from 'next/server';
import { PrivyClient } from '@privy-io/server-auth';

const privyClient = new PrivyClient(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!,
    {
        walletApi: {
            authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!
        }
    }
);

export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);

        // Verify the JWT token
        const claims = await privyClient.verifyAuthToken(token);
        const userId = claims.userId;

        // Get user's wallets
        const user = await privyClient.getUserById(userId);
        if (!user || !user.linkedAccounts) {
            return NextResponse.json({ error: 'User not found' }, { status: 404 });
        }

        // Find embedded Solana wallet
        const solanaWallet = user.linkedAccounts.find(
            (account: any) =>
                account.type === 'wallet' &&
                account.walletClient === 'privy' &&
                !account.address?.startsWith('0x')
        );

        if (!solanaWallet) {
            return NextResponse.json({ error: 'No embedded Solana wallet found' }, { status: 404 });
        }

        const walletId = (solanaWallet as any).id;

        console.log(`[RemoveSigner] Removing signers from wallet ${walletId} for user ${userId}`);

        // Use direct HTTP API call to remove signers
        const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID!;
        const appSecret = process.env.PRIVY_APP_SECRET!;

        const url = `https://auth.privy.io/api/v1/wallets/${walletId}`;
        const body = JSON.stringify({
            additional_signers: []
        });

        const response = await fetch(url, {
            method: 'PATCH',
            headers: {
                'Content-Type': 'application/json',
                'privy-app-id': appId,
                'Authorization': `Basic ${Buffer.from(`${appId}:${appSecret}`).toString('base64')}`,
            },
            body: body,
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[RemoveSigner] Failed to remove signers:`, errorText);
            return NextResponse.json(
                { error: `Failed to remove signers: ${errorText}` },
                { status: response.status }
            );
        }

        const updatedWallet = await response.json();
        console.log(`[RemoveSigner] Successfully removed signers from wallet ${walletId}`);

        return NextResponse.json({
            success: true,
            walletId: updatedWallet.id,
            message: 'Signers removed successfully'
        });

    } catch (error: any) {
        console.error('[RemoveSigner] Error:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to remove signer' },
            { status: 500 }
        );
    }
}
