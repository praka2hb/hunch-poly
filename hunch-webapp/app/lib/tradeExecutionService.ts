import { PrivyClient as PrivyClientNode, type AuthorizationContext } from '@privy-io/node';
import { PrivyClient as PrivyClientLegacy } from '@privy-io/server-auth';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { requestOrder, OrderResponse, USDC_MINT } from './tradeApi';

// Use the new @privy-io/node SDK for wallet operations
const privyClient = new PrivyClientNode({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    appSecret: process.env.PRIVY_APP_SECRET!,
});

// Authorization context for server-side wallet signing
const authorizationContext: AuthorizationContext = {
    authorization_private_keys: [process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!],
};

// Legacy client for user lookups (until fully migrated)
const privyLegacyClient = new PrivyClientLegacy(
    process.env.NEXT_PUBLIC_PRIVY_APP_ID!,
    process.env.PRIVY_APP_SECRET!,
    {
        walletApi: {
            authorizationPrivateKey: process.env.PRIVY_AUTHORIZATION_PRIVATE_KEY!
        }
    }
);

// Connection for sending transactions - use a reliable RPC
const connection = new Connection(
    process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
    {
        commitment: 'confirmed',
        confirmTransactionInitialTimeout: 60000,
    }
);

interface ExecuteTradeParams {
    followerPrivyId: string;
    followerWalletAddress: string;
    marketTicker: string;
    side: 'yes' | 'no';
    amount: number; // In dollars (will be converted to smallest unit)
    outputMint: string; // YES or NO token mint address
}

interface ExecuteTradeResult {
    success: boolean;
    transactionSignature?: string;
    error?: string;
}

/**
 * Execute a trade on behalf of a user using Privy server-side signing
 * This is used for copy trading where the follower may be offline
 * 
 * IMPORTANT: We use signTransaction (sign-only) instead of signAndSendTransaction
 * because Privy's signAndSendTransaction experiences blockhash expiry due to network latency.
 * By signing first and sending ourselves, we have more control over timing.
 */
export async function executeTradeServerSide(
    params: ExecuteTradeParams
): Promise<ExecuteTradeResult> {
    const { followerPrivyId, followerWalletAddress, marketTicker, side, amount, outputMint } = params;

    try {
        console.log(`[TradeExecution] Starting server-side trade for ${followerWalletAddress}`);
        console.log(`  Market: ${marketTicker}, Side: ${side}, Amount: $${amount}`);

        // 1. Get user's wallet information FIRST (to fail fast if not found)
        console.log(`[TradeExecution] Fetching user wallet info for ${followerPrivyId}`);
        const user = await privyLegacyClient.getUserById(followerPrivyId);

        if (!user || !user.linkedAccounts) {
            throw new Error('User not found or has no linked accounts');
        }

        // Find the Solana wallet
        const solanaWallet = user.linkedAccounts.find(
            (account: any) =>
                account.type === 'wallet' &&
                account.id && // Must have a wallet ID for server-side signing
                account.address &&
                typeof account.address === 'string' &&
                !account.address.startsWith('0x') && // Not Ethereum
                account.address === followerWalletAddress // Exact match
        );

        if (!solanaWallet || !(solanaWallet as any).id) {
            console.error('[TradeExecution] Available accounts:', user.linkedAccounts.map((a: any) => ({
                type: a.type,
                walletClient: (a as any).walletClient,
                address: (a as any).address,
                id: (a as any).id
            })));
            throw new Error(`Solana wallet not found for address ${followerWalletAddress}`);
        }

        const walletId = (solanaWallet as any).id;
        console.log(`[TradeExecution] Found wallet ID: ${walletId}`);

        // 2. Convert amount to smallest unit (USDC has 6 decimals)
        const amountInSmallestUnit = Math.floor(amount * 1_000_000).toString();

        // 3. Request order from DFlow API - gets transaction with current blockhash
        console.log(`[TradeExecution] Requesting fresh order from DFlow`);
        const orderResponse: OrderResponse = await requestOrder({
            userPublicKey: followerWalletAddress,
            inputMint: USDC_MINT,
            outputMint: outputMint,
            amount: amountInSmallestUnit,
            slippageBps: 100, // 1% slippage
        });

        console.log(`[TradeExecution] Order received from DFlow, mode: ${orderResponse.executionMode}`);

        // 4. Get transaction from DFlow API response (already base64 encoded)
        const transactionBase64 = orderResponse.transaction || orderResponse.openTransaction;
        if (!transactionBase64) {
            throw new Error('No transaction found in order response');
        }

        // 5. Sign transaction using Privy (sign-only, we'll send ourselves)
        console.log(`[TradeExecution] Signing transaction via Privy for wallet ${walletId}`);

        const signResult = await privyClient.wallets().solana().signTransaction(walletId, {
            transaction: transactionBase64,
            authorization_context: authorizationContext,
        });

        if (!signResult || !signResult.signed_transaction) {
            throw new Error('Failed to sign transaction via Privy');
        }

        console.log(`[TradeExecution] Transaction signed successfully`);

        // 6. Deserialize the signed transaction 
        const signedTransactionBytes = Buffer.from(signResult.signed_transaction, 'base64');
        const signedTransaction = VersionedTransaction.deserialize(signedTransactionBytes);

        // 7. Send the signed transaction ourselves with our own RPC connection
        console.log(`[TradeExecution] Sending signed transaction to Solana`);

        const signature = await connection.sendTransaction(signedTransaction, {
            skipPreflight: false,
            preflightCommitment: 'confirmed',
            maxRetries: 3,
        });

        console.log(`[TradeExecution] Transaction sent: ${signature}`);

        // 8. Wait for confirmation
        console.log(`[TradeExecution] Waiting for confirmation...`);

        const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

        const confirmResult = await connection.confirmTransaction({
            signature,
            blockhash,
            lastValidBlockHeight,
        }, 'confirmed');

        if (confirmResult.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmResult.value.err)}`);
        }

        console.log(`[TradeExecution] Transaction confirmed!`);

        // 9. For async execution mode, poll for order status
        if (orderResponse.executionMode === 'async') {
            console.log(`[TradeExecution] Waiting for async order to complete...`);
            // Just wait a bit for async trades - the order should be processed soon
            await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        return {
            success: true,
            transactionSignature: signature,
        };

    } catch (error: any) {
        console.error(`[TradeExecution] Error executing trade:`, error);
        return {
            success: false,
            error: error.message || 'Unknown error',
        };
    }
}
