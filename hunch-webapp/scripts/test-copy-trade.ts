/**
//  * Copy Trading Test Script
//  * 
//  * This script directly tests the copy trade execution flow without needing
//  * to place a trade from the leader account.
//  * 
//  * Usage: npx tsx --env-file=.env scripts/test-copy-trade.ts
//  * 
//  * Required environment variables:
//  * - DATABASE_URL (for Prisma)
//  * - NEXT_PUBLIC_PRIVY_APP_ID
//  * - PRIVY_APP_SECRET  
//  * - PRIVY_AUTHORIZATION_PRIVATE_KEY
//  * - NEXT_PUBLIC_RPC_URL
//  * - NEXT_PUBLIC_APP_URL (optional, defaults to localhost:3000)
//  */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import { prisma } from '../app/lib/db';

// Configuration - update these values for your test
const TEST_CONFIG = {
    // Leader info
    leaderId: 'cmirc1psz0000i8t3bp1iz04r',

    // Follower info (the one whose wallet will execute the trade)
    followerId: 'cmir5qclk0001nst3gp6jztpm',
    followerPrivyId: 'did:privy:cmiqan4l601rbjx0ckzrt6wem',
    followerWalletAddress: 'EeCCx1Brk1Pzp4MyBiARBReftZMvxNzH8xQDRAWF82Bj',

    // Trade details - use a market that you know works
    marketTicker: 'KXSB-26-SF',
    eventTicker: 'KXSB-26',
    side: 'yes' as const,
    amount: 0.3, // In dollars

    // YES token mint for this market (get from DFlow market API)
    outputMint: '2LCzhj3ntmjxt4nACg45QvYv2WvwpvBKrfDWZui64q2h',
};

async function main() {
    console.log('='.repeat(60));
    console.log('COPY TRADING TEST SCRIPT');
    console.log('='.repeat(60));
    console.log('');
    console.log('Test Configuration:');
    console.log(`  Leader ID: ${TEST_CONFIG.leaderId}`);
    console.log(`  Follower ID: ${TEST_CONFIG.followerId}`);
    console.log(`  Follower Wallet: ${TEST_CONFIG.followerWalletAddress}`);
    console.log(`  Market: ${TEST_CONFIG.marketTicker}`);
    console.log(`  Side: ${TEST_CONFIG.side}`);
    console.log(`  Amount: $${TEST_CONFIG.amount}`);
    console.log('');


    try {
        // 1. Check copy settings exist
        console.log('[Step 1] Checking copy settings...');
        const copySettings = await prisma.copySettings.findUnique({
            where: {
                followerId_leaderId: {
                    followerId: TEST_CONFIG.followerId,
                    leaderId: TEST_CONFIG.leaderId,
                },
            },
        });

        if (!copySettings) {
            console.error('❌ No copy settings found for this follower/leader pair');
            console.log('   Make sure the follower has followed the leader and enabled copy trading');
            return;
        }

        console.log('✅ Copy settings found:');
        console.log(`   Enabled: ${copySettings.enabled}`);
        console.log(`   Amount per trade: $${copySettings.amountPerTrade}`);
        console.log(`   Max total amount: $${copySettings.maxTotalAmount}`);
        console.log(`   Used amount: $${copySettings.usedAmount}`);
        console.log('');

        if (!copySettings.enabled) {
            console.error('❌ Copy settings are disabled');
            return;
        }

        // 2. Check follower info
        console.log('[Step 2] Checking follower info...');
        const follower = await prisma.user.findUnique({
            where: { id: TEST_CONFIG.followerId },
            select: { walletAddress: true, privyId: true },
        });

        if (!follower) {
            console.error('❌ Follower not found in database');
            return;
        }

        console.log('✅ Follower found:');
        console.log(`   Wallet: ${follower.walletAddress}`);
        console.log(`   Privy ID: ${follower.privyId}`);
        console.log('');

        // 3. Now test the trade execution service directly
        console.log('[Step 3] Testing trade execution service...');
        console.log('');

        // Import the trade execution service dynamically
        const { executeTradeServerSide } = await import('../app/lib/tradeExecutionService');

        console.log('Calling executeTradeServerSide with:');
        console.log(`  followerPrivyId: ${follower.privyId}`);
        console.log(`  followerWalletAddress: ${follower.walletAddress}`);
        console.log(`  marketTicker: ${TEST_CONFIG.marketTicker}`);
        console.log(`  side: ${TEST_CONFIG.side}`);
        console.log(`  amount: ${TEST_CONFIG.amount}`);
        console.log(`  outputMint: ${TEST_CONFIG.outputMint}`);
        console.log('');

        const startTime = Date.now();

        const result = await executeTradeServerSide({
            followerPrivyId: follower.privyId,
            followerWalletAddress: follower.walletAddress,
            marketTicker: TEST_CONFIG.marketTicker,
            side: TEST_CONFIG.side,
            amount: TEST_CONFIG.amount,
            outputMint: TEST_CONFIG.outputMint,
        });

        const duration = ((Date.now() - startTime) / 1000).toFixed(2);

        console.log('');
        console.log('='.repeat(60));
        console.log('RESULT:');
        console.log('='.repeat(60));
        console.log(`  Duration: ${duration}s`);
        console.log(`  Success: ${result.success}`);

        if (result.success) {
            console.log(`  ✅ Transaction Signature: ${result.transactionSignature}`);
            console.log(`  View on Solscan: https://solscan.io/tx/${result.transactionSignature}`);
        } else {
            console.log(`  ❌ Error: ${result.error}`);
        }

    } catch (error: any) {
        console.error('');
        console.error('='.repeat(60));
        console.error('SCRIPT ERROR:');
        console.error('='.repeat(60));
        console.error(error.message || error);
        console.error('');
        console.error('Full error:', error);
    } finally {
        await prisma.$disconnect();
    }
}

main().catch(console.error);
