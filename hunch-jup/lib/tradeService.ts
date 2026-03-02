// Trade service for Polygon prediction order integration via backend.
// Handles order requests, EVM transaction signing, and send/confirm flow.

import { authenticatedFetch } from './api';
import { POLYGON_CHAIN_ID_HEX, POLYGON_RPC_URL, POLYGON_USDC_ADDRESS, waitForPolygonTx } from './polygon';

// Constants
export const USDC_MINT = POLYGON_USDC_ADDRESS; // Polygon native USDC (0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359)
export const DECIMALS = 1_000_000; // 6 decimals for USDC and outcome tokens

// Backend API URL - all prediction orders must go through backend.
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://hunchdotrun-roan.vercel.app';

// Types
export interface DFlowOrderResponse {
    transaction: string; // base64 or hex encoded EVM tx from backend
    openTransaction?: string; // alternate field name
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
 * Check if an error indicates nonce/block expiry (requires new quote)
 */
export function isBlockhashExpiredError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
        message.includes('nonce too low') ||
        message.includes('nonce has already been used') ||
        message.includes('replacement transaction underpriced') ||
        message.includes('already known') ||
        message.includes('blockhash not found') ||
        message.includes('blockhash expired') ||
        message.includes('transaction has already been processed')
    );
}

/**
 * Check if an error indicates simulation failure (may require new quote)
 */
export function isSimulationError(error: any): boolean {
    const message = error?.message?.toLowerCase() || '';
    return (
        message.includes('execution reverted') ||
        message.includes('insufficient funds') ||
        message.includes('gas required exceeds allowance') ||
        message.includes('out of gas')
    );
}

/**
 * Request a prediction order from backend.
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

    console.log('[TradeService] Requesting prediction order from backend:', { marketId, isYes, isBuy, amount });

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
    const txData = order.transaction || order.openTransaction;
    if (!txData) {
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
        transaction: txData,
        executionMode: 'sync',
        inAmount: normalizedInAmount,
        outAmount: normalizedOutAmount,
    };
}

/**
 * Get the status of an order by its transaction hash
 */
export async function getOrderStatus(signature: string): Promise<DFlowOrderStatus> {
    console.log('[TradeService] getOrderStatus is a compatibility no-op:', signature);
    return { status: 'closed' };
}

/**
 * Wait for an async order to complete via Polygon tx receipt.
 */
export async function waitForOrderCompletion(
    txHash: string,
    maxAttempts: number = 10,
    intervalMs: number = 2000
): Promise<DFlowOrderStatus> {
    const success = await waitForPolygonTx(txHash, POLYGON_RPC_URL, maxAttempts * intervalMs);
    if (success === false) {
        throw createTradeError('Transaction reverted on chain', 'SIMULATION_FAILED', true);
    }
    return { status: 'closed' };
}

/**
 * Parse an EVM transaction from the backend response.
 * The backend may return base64-encoded raw tx bytes or a JSON tx object.
 */
export function parseTransactionFromBackend(txData: string): any {
    console.log('[TradeService] Parsing EVM tx from backend, data length:', txData.length);

    // Try JSON parse first (backend may return a structured tx object)
    try {
        const parsed = JSON.parse(txData);
        if (parsed && (parsed.to || parsed.data)) {
            console.log('[TradeService] Parsed JSON transaction object');
            return parsed;
        }
    } catch {
        // Not JSON, try base64
    }

    // Base64 encoded raw transaction bytes — return as hex for eth_sendRawTransaction
    try {
        const bytes = Buffer.from(txData, 'base64');
        const hex = '0x' + bytes.toString('hex');
        console.log('[TradeService] Decoded base64 tx to hex, length:', hex.length);
        return { rawTx: hex };
    } catch {
        // If it's already hex
        if (txData.startsWith('0x')) {
            return { rawTx: txData };
        }
    }

    throw createTradeError('Could not parse transaction from backend', 'UNKNOWN', false);
}

/**
 * Sign and send an EVM transaction using Privy embedded Ethereum wallet provider.
 *
 * FLOW:
 * 1. Backend returns a transaction (structured tx or raw bytes)
 * 2. If structured tx: use eth_sendTransaction via Privy provider (Privy signs + sends)
 * 3. If raw tx: use eth_sendRawTransaction
 *
 * @returns Transaction hash
 */
export async function signAndSendWithPrivy(
    provider: any,
    txData: string,
): Promise<string> {
    console.log('[TradeService] Starting Polygon sign+send flow...');

    const parsed = parseTransactionFromBackend(txData);

    // Ensure provider is on Polygon
    try {
        await provider.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: POLYGON_CHAIN_ID_HEX }],
        });
    } catch (switchError: any) {
        console.warn('[TradeService] Chain switch warning:', switchError?.message);
    }

    let txHash: string;

    if (parsed.rawTx) {
        // Pre-signed raw transaction — send directly
        console.log('[TradeService] Sending pre-signed raw tx...');
        txHash = await provider.request({
            method: 'eth_sendRawTransaction',
            params: [parsed.rawTx],
        });
    } else {
        // Structured transaction object — have Privy sign and send
        console.log('[TradeService] Sending structured tx via eth_sendTransaction...');
        const txParams: any = {
            to: parsed.to,
            data: parsed.data || '0x',
            value: parsed.value || '0x0',
        };
        if (parsed.from) txParams.from = parsed.from;
        if (parsed.gas) txParams.gas = parsed.gas;
        if (parsed.gasLimit) txParams.gas = parsed.gasLimit;
        if (parsed.chainId) txParams.chainId = typeof parsed.chainId === 'number'
            ? '0x' + parsed.chainId.toString(16) : parsed.chainId;

        txHash = await provider.request({
            method: 'eth_sendTransaction',
            params: [txParams],
        });
    }

    if (!txHash) {
        throw createTradeError('No transaction hash returned', 'SIGNING_ERROR', false);
    }

    console.log('[TradeService] Transaction sent:', txHash);
    return txHash;
}

/**
 * Execute a complete trade flow with automatic retry.
 *
 * FLOW:
 * 1. Request order from backend (/api/jupiter-prediction/orders)
 * 2. Parse EVM transaction from response
 * 3. Sign and send via Privy Ethereum wallet on Polygon
 * 4. Wait for confirmation if async mode
 *
 * RETRY LOGIC:
 * - On nonce/gas errors: request NEW order and retry
 * - On user rejection: don't retry
 * - Max 2 retries for network errors
 */
export async function executeTrade(params: {
    provider: any;
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

            // Step 1: Get order from backend
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

            // Step 2 & 3: Parse and send EVM transaction
            const txHash = await signAndSendWithPrivy(provider, order.transaction);

            // Step 4: Wait for confirmation if async
            if (order.executionMode === 'async') {
                await waitForOrderCompletion(txHash);
            }

            console.log('[TradeService] Trade executed successfully:', txHash);
            return { signature: txHash, order };

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

    // Should never reach here
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
 * USDC has 6 decimals: $10 → "10000000"
 */
export function toRawAmount(humanAmount: number | string, decimals: number = 6): string {
    const amount = typeof humanAmount === 'string' ? parseFloat(humanAmount) : humanAmount;
    return Math.floor(amount * Math.pow(10, decimals)).toString();
}

/**
 * Convert raw amount (smallest unit) to human-readable
 */
export function fromRawAmount(rawAmount: string | number, decimals: number = 6): number {
    const amount = typeof rawAmount === 'string' ? parseInt(rawAmount, 10) : rawAmount;
    return amount / Math.pow(10, decimals);
}

/**
 * Send USDC from one wallet to another on Polygon.
 *
 * Flow:
 * 1. POST /api/send-usdc → backend builds EVM transfer tx, returns tx data
 * 2. Parse EVM transaction
 * 3. Sign and send via Privy embedded Ethereum wallet
 */
export async function sendUSDC({
    provider,
    wallet,
    fromAddress,
    toAddress,
    amount,
    type = 'send',
    senderName,
}: {
    provider: any;
    wallet?: any;
    fromAddress: string;
    toAddress: string;
    amount: number;
    /** 'send' triggers a push notification to the recipient.
     *  'withdraw' is a personal withdrawal — no notification sent. */
    type?: 'send' | 'withdraw';
    /** Display name of the sender shown in the push notification (send only) */
    senderName?: string;
}): Promise<string> {
    console.log(`[TradeService] Requesting USDC ${type} tx from backend...`);

    // Step 1: Get transaction from backend (auto-injects Privy JWT)
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

    const { transaction: txData } = await response.json();
    if (!txData) {
        throw createTradeError('No transaction returned from backend', 'UNKNOWN', true);
    }

    // Step 2 & 3: Parse and sign/send via Privy on Polygon
    console.log('[TradeService] Signing and sending USDC transfer on Polygon...');

    try {
        const txHash = await signAndSendWithPrivy(provider, txData);
        console.log('[TradeService] USDC transfer sent:', txHash);

        // Wait for confirmation (up to 30s)
        const success = await waitForPolygonTx(txHash, POLYGON_RPC_URL, 30_000);
        if (success === false) {
            throw createTradeError('USDC transfer reverted on chain', 'SIMULATION_FAILED', false);
        }

        console.log('[TradeService] USDC transfer confirmed:', txHash);
        return txHash;
    } catch (err: any) {
        console.error('[TradeService] USDC transfer error:', err);
        throw createTradeError(
            err?.message || 'Failed to sign and send USDC transfer',
            'SIGNING_ERROR',
            false
        );
    }
}

