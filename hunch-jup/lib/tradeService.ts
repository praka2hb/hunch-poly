// Trade service for Jupiter prediction order integration via backend.
// Handles order requests, transaction signing, and send/confirm flow.

import { clusterApiUrl, Connection, VersionedTransaction } from '@solana/web3.js';
import { authenticatedFetch } from './api';

// Constants
export const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const DECIMALS = 1_000_000; // 6 decimals for USDC and outcome tokens

// Default send options - mirror web behavior
export const DEFAULT_SEND_OPTIONS = {
    skipPreflight: true,
    maxRetries: 3,
    preflightCommitment: 'confirmed' as const,
};

// Backend API URL - all prediction orders must go through backend.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://hunchdotrun-roan.vercel.app';

// Types
export interface DFlowOrderResponse {
    transaction: string; // base64 encoded - ALREADY sponsor-signed from backend
    openTransaction?: string; // alternate field name for base64 tx
    executionMode: 'sync' | 'async';
    inAmount: string;
    outAmount: string;
    inputMint?: string;
    outputMint?: string;
    lastValidBlockHeight?: number;
    prioritizationFeeLamports?: number;
    computeUnitLimit?: number;
    txMeta?: {
        blockhash: string;
        lastValidBlockHeight: number;
    } | null;
    externalOrderId?: string | null;
    order?: any;
}

export interface DFlowOrderStatus {
    status: 'open' | 'closed' | 'pendingClose' | 'failed';
    fills?: { qtyIn: string; qtyOut: string }[];
}

export interface OrderParams {
    userPublicKey: string;
    amount: string; // smallest USDC units for buys, token contracts for sells
    marketId: string;
    isYes: boolean;
    isBuy?: boolean;
    positionPubkey?: string;
    slippageBps?: number;
}

export interface TradeError extends Error {
    code?: 'BLOCKHASH_EXPIRED' | 'SIMULATION_FAILED' | 'NETWORK_ERROR' | 'SIGNING_ERROR' | 'UNKNOWN';
    retryable: boolean;
}

// Helper to sleep for polling
export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create a typed trade error
 */
function createTradeError(
    message: string,
    code: TradeError['code'] = 'UNKNOWN',
    retryable: boolean = false
): TradeError {
    const error = new Error(message) as TradeError;
    error.code = code;
    error.retryable = retryable;
    return error;
}

/**
 * Check if an error indicates blockhash expiry (requires new quote)
 */
export function isBlockhashExpiredError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
        message.includes('blockhash not found') ||
        message.includes('blockhash expired') ||
        message.includes('block height exceeded') ||
        message.includes('transaction has already been processed')
    );
}

/**
 * Check if an error indicates simulation failure (may require new quote)
 */
export function isSimulationError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
        message.includes('simulation failed') ||
        message.includes('insufficient funds') ||
        message.includes('custom program error')
    );
}

function isMissingAccountCreditError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return message.includes('attempt to debit an account but found no record of a prior credit');
}

/**
 * Request a Jupiter prediction order from backend.
 */
export async function requestOrder(params: OrderParams): Promise<DFlowOrderResponse> {
    const {
        userPublicKey,
        amount,
        marketId,
        isYes,
        isBuy = true,
        positionPubkey,
    } = params;

    // Validate amount format (should be smallest unit string)
    if (!/^\d+$/.test(amount)) {
        console.warn('[TradeService] Amount should be a string of digits (smallest unit). Got:', amount);
    }

    const body: Record<string, unknown> = {
        ownerPubkey: userPublicKey,
        marketId,
        isYes,
        isBuy,
    };

    if (isBuy) {
        body.depositAmount = amount;
    } else {
        body.positionPubkey = positionPubkey;
        body.contracts = amount;
    }

    console.log('[TradeService] Requesting Jupiter prediction order from backend:', { marketId, isYes, isBuy, amount });

    const response = await fetch(`${API_BASE_URL}/api/jupiter-prediction/orders`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[TradeService] Order request failed:', response.status, errorText);
        throw createTradeError(
            `Failed to get order: ${response.status} - ${errorText}`,
            'NETWORK_ERROR',
            true
        );
    }

    const order = await response.json();

    // Support both 'transaction' and 'openTransaction' field names
    const txBase64 = order.transaction || order.openTransaction;
    if (!txBase64) {
        throw createTradeError(
            'No transaction returned from backend',
            'UNKNOWN',
            true
        );
    }

    const rawContracts = isBuy
        ? String(order?.order?.newContracts ?? order?.order?.contracts ?? order?.order?.newSizeUsd ?? '0')
        : String(order?.order?.contracts ?? amount);
    const rawOrderCostUsd = String(order?.order?.orderCostUsd ?? order?.order?.newSizeUsd ?? '0');
    const normalizedInAmount = isBuy ? amount : rawContracts;
    const normalizedOutAmount = isBuy
        ? normalizeToRawUnits(rawContracts)
        : normalizeUsdToRawUnits(rawOrderCostUsd);

    return {
        ...order,
        transaction: txBase64,
        executionMode: 'sync',
        inAmount: normalizedInAmount,
        outAmount: normalizedOutAmount,
    };
}

/**
 * Get the status of an order by its transaction signature
 */
export async function getOrderStatus(signature: string): Promise<DFlowOrderStatus> {
    console.log('[TradeService] getOrderStatus is a compatibility no-op for Jupiter:', signature);
    return { status: 'closed' };
}

/**
 * Wait for an async order to complete
 * Returns the final status or assumes success if status check fails
 * (since transaction was already sent to blockchain)
 */
export async function waitForOrderCompletion(
    signature: string,
    maxAttempts: number = 10,
    intervalMs: number = 2000
): Promise<DFlowOrderStatus> {
    await sleep(Math.min(intervalMs, 500));
    return { status: 'closed' };
}

/**
 * Deserialize a base64 transaction from the backend
 * The transaction is ALREADY sponsor-signed by the backend
 */
export function deserializeTransaction(base64Transaction: string): VersionedTransaction {
    console.log('[TradeService] Deserializing sponsor-signed tx, base64 length:', base64Transaction.length);

    // Decode base64 to bytes
    const transactionBytes = Uint8Array.from(
        Buffer.from(base64Transaction, 'base64')
    );
    console.log('[TradeService] Transaction byte length:', transactionBytes.length);

    // Deserialize to VersionedTransaction
    const tx = VersionedTransaction.deserialize(transactionBytes);

    // Log fee payer (account 0) for debugging
    const feePayer = tx.message.staticAccountKeys[0];
    console.log('[TradeService] Fee Payer (sponsor):', feePayer.toString());

    // Verify sponsor signature exists (should be non-zero)
    const sponsorSig = tx.signatures[0];
    const hasValidSponsorSig = sponsorSig && !sponsorSig.every(b => b === 0);
    console.log('[TradeService] Sponsor signature present:', hasValidSponsorSig);

    if (!hasValidSponsorSig) {
        console.warn('[TradeService] WARNING: Sponsor signature appears to be missing or empty!');
    }

    return tx;
}

/**
 * Sign and send a sponsor-signed transaction using Privy wallet provider
 * 
 * FLOW:
 * 1. Transaction is ALREADY sponsor-signed (from backend)
 * 2. User signs with Privy signTransaction (sign-only, NOT signAndSendTransaction)
 * 3. We serialize and send with our own RPC connection
 * 
 * This gives us control over:
 * - When the tx is sent
 * - Retry logic with fresh quotes if blockhash expires
 * - Send options (skipPreflight, maxRetries)
 * 
 * @returns Transaction signature
 */
export async function signAndSendWithPrivy(
    provider: any,
    transaction: VersionedTransaction,
    connection: Connection
): Promise<string> {
    console.log('[TradeService] Starting user sign flow...');

    // Log pre-signing signature state
    const preSigs = transaction.signatures.map((s, i) => ({
        index: i,
        hasSignature: s && !s.every(b => b === 0),
        preview: Buffer.from(s.slice(0, 8)).toString('hex'),
    }));
    console.log('[TradeService] Signatures before user sign:', preSigs);

    // 1. Ask Privy to JUST SIGN the transaction (not send)
    // CRITICAL: Use signTransaction, NOT signAndSendTransaction
    // This returns a transaction with the user's signature added
    let signedTransaction: VersionedTransaction;
    try {
        const response = await provider.request({
            method: 'signTransaction',
            params: {
                transaction,
                connection,
            }
        });

        // Unwrap the response if Privy wraps it
        signedTransaction = response.signedTransaction || response;

        if (!signedTransaction || !signedTransaction.signatures) {
            throw createTradeError(
                'No signatures returned from wallet',
                'SIGNING_ERROR',
                false
            );
        }
    } catch (error: any) {
        // User rejected or wallet error
        if (error.code === 4001 || error.message?.includes('rejected')) {
            throw createTradeError('Transaction rejected by user', 'SIGNING_ERROR', false);
        }
        throw createTradeError(
            `Signing failed: ${error.message || 'Unknown error'}`,
            'SIGNING_ERROR',
            false
        );
    }

    // Log post-signing signature state
    const postSigs = signedTransaction.signatures.map((s: Uint8Array, i: number) => ({
        index: i,
        hasSignature: s && !s.every((b: number) => b === 0),
        preview: Buffer.from(s.slice(0, 8)).toString('hex'),
    }));
    console.log('[TradeService] Signatures after user sign:', postSigs);

    // Verify we have at least 2 signatures (sponsor + user)
    const validSigCount = signedTransaction.signatures.filter(
        (s: Uint8Array) => s && !s.every((b: number) => b === 0)
    ).length;

    if (validSigCount < 2) {
        console.warn(`[TradeService] WARNING: Only ${validSigCount} valid signature(s). Expected 2 (sponsor + user).`);
    }

    // 2. Serialize and send with our RPC (mirrors web behavior)
    const rawTransaction = signedTransaction.serialize();
    console.log('[TradeService] Sending raw transaction, size:', rawTransaction.length);

    try {
        const signature = await connection.sendRawTransaction(rawTransaction, DEFAULT_SEND_OPTIONS);
        console.log('[TradeService] Transaction sent successfully:', signature);
        return signature;
    } catch (error: any) {
        console.error('[TradeService] Send failed:', error);

        // Classify the error for retry logic
        if (isBlockhashExpiredError(error)) {
            throw createTradeError(
                'Transaction expired. Please try again.',
                'BLOCKHASH_EXPIRED',
                true
            );
        }
        if (isSimulationError(error)) {
            throw createTradeError(
                `Transaction simulation failed: ${error.message}`,
                'SIMULATION_FAILED',
                true
            );
        }
        throw createTradeError(
            error.message || 'Failed to send transaction',
            'NETWORK_ERROR',
            true
        );
    }
}

/**
 * Execute a complete trade flow with automatic retry on blockhash expiry
 * 
 * OPTIMAL FLOW:
 * 1. Request sponsor-signed order from backend (/api/jupiter-prediction/orders)
 * 2. Decode base64 → VersionedTransaction (sponsor already signed)
 * 3. User signs (signTransaction only)
 * 4. Send with our RPC (skipPreflight: true, maxRetries: 3)
 * 5. Wait for confirmation if async mode
 * 
 * RETRY LOGIC:
 * - On blockhash expiry or simulation failure: request NEW order and retry
 * - On user rejection or signing error: don't retry
 * - Max 2 retries for network/expiry errors
 */
export async function executeTrade(params: {
    provider: any;
    connection: Connection;
    userPublicKey: string;
    amount: string;
    marketId: string;
    isYes: boolean;
    isBuy?: boolean;
    positionPubkey?: string;
    slippageBps?: number;
    maxRetries?: number;
}): Promise<{
    signature: string;
    order: DFlowOrderResponse;
}> {
    const {
        provider,
        connection,
        userPublicKey,
        amount,
        marketId,
        isYes,
        isBuy = true,
        positionPubkey,
        slippageBps = 100,
        maxRetries = 2
    } = params;

    let lastError: TradeError | Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            if (attempt > 0) {
                console.log(`[TradeService] Retry attempt ${attempt}/${maxRetries}...`);
            }

            // Step 1: Get sponsor-signed order from backend
            console.log('[TradeService] Requesting order for:', userPublicKey.substring(0, 8) + '...');
            const order = await requestOrder({
                userPublicKey,
                amount,
                marketId,
                isYes,
                isBuy,
                positionPubkey,
                slippageBps,
            });

            // Step 2: Deserialize (tx is already sponsor-signed)
            const transaction = deserializeTransaction(order.transaction);

            // Step 3 & 4: User sign + send (minimize delay between these)
            const signature = await signAndSendWithPrivy(provider, transaction, connection);

            // Step 5: Wait for confirmation if async
            if (order.executionMode === 'async') {
                await waitForOrderCompletion(signature);
            }

            console.log('[TradeService] Trade executed successfully:', signature);
            return { signature, order };

        } catch (error: any) {
            lastError = error;
            console.error(`[TradeService] Trade attempt ${attempt + 1} failed:`, error.message);

            // Don't retry on non-retryable errors (user rejection, etc.)
            if (error.retryable === false) {
                throw error;
            }

            // Don't retry if we've exhausted attempts
            if (attempt >= maxRetries) {
                throw error;
            }

            // Small delay before retry
            await sleep(500);
        }
    }

    // Should never reach here, but just in case
    throw lastError || createTradeError('Trade failed after all retries', 'UNKNOWN', false);
}

function normalizeToRawUnits(value: string): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (Number.isInteger(num) && num > 10_000) return String(num);
    return String(Math.floor(num * DECIMALS));
}

function normalizeUsdToRawUnits(value: string): string {
    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) return '0';
    if (num > 10_000) return String(Math.floor(num));
    return String(Math.floor(num * DECIMALS));
}

/**
 * Convert human-readable amount to raw amount (smallest unit)
 * 
 * IMPORTANT: DFlow expects amounts in smallest unit:
 * - USDC has 6 decimals: $10 → "10000000"
 * - Outcome tokens have 6 decimals
 * 
 * @param humanAmount - Human readable amount (e.g., 10 for $10)
 * @param decimals - Number of decimals (default 6 for USDC)
 * @returns String representation of smallest unit amount
 */
export function toRawAmount(humanAmount: number | string, decimals: number = 6): string {
    const amount = typeof humanAmount === 'string' ? parseFloat(humanAmount) : humanAmount;
    return Math.floor(amount * Math.pow(10, decimals)).toString();
}

/**
 * Convert raw amount (smallest unit) to human-readable
 * 
 * @param rawAmount - Amount in smallest unit
 * @param decimals - Number of decimals (default 6 for USDC)
 * @returns Human readable amount
 */
export function fromRawAmount(rawAmount: string | number, decimals: number = 6): number {
    const amount = typeof rawAmount === 'string' ? parseInt(rawAmount, 10) : rawAmount;
    return amount / Math.pow(10, decimals);
}

/**
 * Send USDC from one wallet to another via SPL token transfer.
 *
 * Flow (Privy Sponsor):
 * 1. POST /api/send-usdc  →  backend builds UNSIGNED SPL transfer tx, returns base64
 * 2. Client decodes → VersionedTransaction
 * 3. provider.request('signAndSendTransaction', { options: { sponsor: true } })
 *    → Privy co-signs as fee payer + user signs + Privy broadcasts
 *
 * Backend does NOT need a sponsor private key — Privy handles fee payment.
 */
export async function sendUSDC({
    provider,
    wallet,
    connection,
    fromAddress,
    toAddress,
    amount,
    type = 'send',
    senderName,
}: {
    provider: any;
    wallet?: any;
    connection: Connection;
    fromAddress: string;
    toAddress: string;
    amount: number;
    /** 'send' triggers a push notification to the recipient.
     *  'withdraw' is a personal withdrawal — no notification sent. */
    type?: 'send' | 'withdraw';
    /** Display name of the sender shown in the push notification (send only) */
    senderName?: string;
}): Promise<string> {
    console.log(`[TradeService] Requesting unsigned USDC ${type} tx from backend...`);

    // Step 1: Get unsigned tx + tell backend what type this is (auto-injects Privy JWT)
    const response = await authenticatedFetch(`${API_BASE_URL}/api/send-usdc`, {
        method: 'POST',
        body: JSON.stringify({ fromAddress, toAddress, amount, type, senderName }),
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw createTradeError(
            `Failed to build USDC transfer: ${response.status} - ${errorText}`,
            'NETWORK_ERROR',
            true
        );
    }

    const { transaction: txBase64 } = await response.json();
    if (!txBase64) {
        throw createTradeError('No transaction returned from backend', 'UNKNOWN', true);
    }

    // Step 2: Deserialize (UNSIGNED — backend did NOT sponsor-sign it)
    const transactionBytes = Uint8Array.from(Buffer.from(txBase64, 'base64'));
    const tx = VersionedTransaction.deserialize(transactionBytes);
    console.log('[TradeService] Unsigned tx decoded, submitting via Privy with options.sponsor: true...');

    // Step 3: Privy acts as fee payer + user signs + Privy broadcasts
    const sendWithConnection = async (conn: Connection) =>
        provider.request({
            method: 'signAndSendTransaction',
            params: {
                transaction: tx,
                wallet,
                chain: 'solana:mainnet',
                connection: conn,
                sponsor: true,
                options: {
                    // Privy docs use `sponsor`; keep legacy key too for SDK compatibility.
                    sponsor: true,
                    sponsorTransaction: true,
                },
            },
        });

    try {
        let result: any;
        try {
            result = await sendWithConnection(connection);
        } catch (err: any) {
            // Retry once on explicit mainnet RPC when provider/connection cluster mismatch
            // causes "Attempt to debit an account but found no record of a prior credit."
            if (isMissingAccountCreditError(err)) {
                const fallbackConn = new Connection(clusterApiUrl('mainnet-beta'), 'confirmed');
                console.warn('[TradeService] Retrying USDC send on mainnet RPC due to account credit simulation error...');
                result = await sendWithConnection(fallbackConn);
            } else {
                throw err;
            }
        }

        const signature: string =
            typeof result === 'string'
                ? result
                : (result?.signature ?? result?.hash ?? result?.txHash ?? '');

        if (!signature) {
            throw new Error('No signature returned from Privy signAndSendTransaction');
        }

        console.log('[TradeService] USDC transfer confirmed:', signature);
        return signature;
    } catch (err: any) {
        console.error('[TradeService] Privy sponsor send error:', err);
        throw createTradeError(
            err?.message || 'Failed to sign and send USDC transfer',
            'SIGNING_ERROR',
            false
        );
    }
}

