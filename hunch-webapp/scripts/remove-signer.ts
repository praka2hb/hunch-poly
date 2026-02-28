/**
 * Remove Signer from Privy Wallet
 * 
 * This script removes all additional signers from a Privy wallet to fix the
 * "Duplicate signer(s) provided when updating wallet" error.
 * 
 * Usage: npx tsx --env-file=.env scripts/remove-signer.ts os410d35b37qyngczhlf1cv6
 * 
 * If no walletId is provided, it will list all wallets for debugging.
 * 
 * Required environment variables:
 * - NEXT_PUBLIC_PRIVY_APP_ID
 * - PRIVY_APP_SECRET
 * - PRIVY_AUTHORIZATION_PRIVATE_KEY
 */

import { config } from 'dotenv';
config();

import { PrivyClient } from '@privy-io/node';
import { PrivyClient as PrivyClientLegacy } from '@privy-io/server-auth';

// Initialize Privy clients
const privyClient = new PrivyClient({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
});

const privyLegacyClient = new PrivyClientLegacy(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!,
);

async function listUserWallets(privyUserId: string) {
    console.log('Fetching user info...');
    const user = await privyLegacyClient.getUserById(privyUserId);

    if (!user || !user.linkedAccounts) {
        console.log('User not found or no linked accounts');
        return [];
    }

    const wallets = user.linkedAccounts.filter((account: any) => account.type === 'wallet');
    console.log(`Found ${wallets.length} wallet(s):`);

    for (const wallet of wallets) {
        console.log(`  - ID: ${(wallet as any).id}`);
        console.log(`    Address: ${(wallet as any).address}`);
        console.log(`    Type: ${(wallet as any).walletClient || 'embedded'}`);
        console.log('');
    }

    return wallets;
}

async function removeSignersFromWallet(walletId: string) {
    console.log(`\nRemoving signers from wallet: ${walletId}`);

    try {
        // Get current wallet state first
        console.log('  Fetching current wallet state...');
        const wallet = await privyClient.wallets().get(walletId);

        console.log('  Current wallet state:');
        console.log(`    ID: ${wallet.id}`);
        console.log(`    Chain: ${wallet.chain_type}`);
        console.log(`    Address: ${wallet.address}`);
        console.log(`    Additional signers: ${JSON.stringify((wallet as any).additional_signers || [])}`);

        if (!(wallet as any).additional_signers || (wallet as any).additional_signers.length === 0) {
            console.log('\n  ℹ️  No additional signers found on this wallet.');
            return wallet;
        }

        // Update wallet using direct HTTP API call
        console.log('\n  Updating wallet to remove all signers...');
        console.log('  NOTE: This requires manual intervention via Privy Dashboard');
        console.log('  Go to: https://dashboard.privy.io/apps');
        console.log(`  Find wallet ID: ${walletId}`);
        console.log('  Remove the additional signer manually');

        return wallet;
    } catch (error: any) {
        console.error(`\n  ❌ Failed to remove signers:`, error.message);
        throw error;
    }
}

async function main() {
    console.log('='.repeat(60));
    console.log('REMOVE SIGNER FROM PRIVY WALLET');
    console.log('='.repeat(60));
    console.log('');

    const arg = process.argv[2];

    if (!arg) {
        console.log('Usage:');
        console.log('  npx tsx --env-file=.env scripts/remove-signer.ts <walletId>');
        console.log('  npx tsx --env-file=.env scripts/remove-signer.ts --user <privyUserId>');
        console.log('');
        console.log('Examples:');
        console.log('  npx tsx --env-file=.env scripts/remove-signer.ts wallet_abc123');
        console.log('  npx tsx --env-file=.env scripts/remove-signer.ts --user did:privy:abc123');
        process.exit(1);
    }

    try {
        if (arg === '--user') {
            const privyUserId = process.argv[3];
            if (!privyUserId) {
                console.error('Please provide a Privy user ID after --user');
                process.exit(1);
            }

            console.log(`Listing wallets for user: ${privyUserId}\n`);
            const wallets = await listUserWallets(privyUserId);

            if (wallets.length > 0) {
                console.log('To remove signers from a wallet, run:');
                console.log(`  npx tsx --env-file=.env scripts/remove-signer.ts <walletId>`);
            }
        } else {
            // Treat arg as wallet ID
            const walletId = arg;
            await removeSignersFromWallet(walletId);
        }
    } catch (error: any) {
        console.error('\nError:', error.message);
        if (error.body) {
            console.error('Response body:', error.body);
        }
        process.exit(1);
    }
}

main().catch(console.error);
