/**
 * Polygon chain utilities for USDC balance, EVM provider, and chain constants.
 */

// ─── Chain Constants ────────────────────────────────────────────────
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_CHAIN_ID_HEX = '0x89';

/** Native USDC on Polygon — 6 decimals */
export const POLYGON_USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

/** Bridged USDC.e on Polygon (PoS bridged) — 6 decimals */
export const POLYGON_USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

/**
 * Public Polygon RPC endpoints in priority order.
 * If EXPO_PUBLIC_POLYGON_RPC_URL is set it is tried first.
 * The helper `jsonRpcCall` will automatically fall through to the next
 * endpoint if a response contains an error or the request fails.
 */
const POLYGON_RPC_FALLBACKS = [
    'https://polygon-mainnet.g.alchemy.com/v2/m3lLri2GI6iG8I2vtbVF4'
];

/** Primary RPC — exported for use in tradeService and elsewhere */
export const POLYGON_RPC_URL =
    process.env.EXPO_PUBLIC_POLYGON_RPC_URL || POLYGON_RPC_FALLBACKS[0];

/**
 * Execute a JSON-RPC call trying the primary URL first, then each fallback.
 * Throws only if every endpoint fails.
 */
async function jsonRpcCall(body: string, primaryUrl?: string): Promise<any> {
    const endpoints = [
        ...(primaryUrl ? [primaryUrl] : []),
        POLYGON_RPC_URL,
        ...POLYGON_RPC_FALLBACKS.filter(u => u !== POLYGON_RPC_URL),
    ];
    // Deduplicate while preserving order
    const seen = new Set<string>();
    const urls = endpoints.filter(u => { if (seen.has(u)) return false; seen.add(u); return true; });

    let lastError: Error | null = null;
    for (const url of urls) {
        try {
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body,
            });
            const json = await res.json();
            if (json.error) {
                // RPC-level error — try next endpoint
                lastError = new Error(`RPC error: ${json.error.message || JSON.stringify(json.error)}`);
                console.warn(`[polygon] ${url} error: ${lastError.message}, trying next...`);
                continue;
            }
            return json;
        } catch (err: any) {
            lastError = err;
            console.warn(`[polygon] ${url} fetch failed: ${err.message}, trying next...`);
        }
    }
    throw lastError || new Error('All Polygon RPC endpoints failed');
}

// Minimal ERC-20 ABI fragment for balanceOf
const ERC20_BALANCE_OF_SELECTOR = '0x70a08231'; // keccak256("balanceOf(address)")

// ─── Helper: ABI-encode an address for eth_call ─────────────────────
function encodeAddress(address: string): string {
    // Remove 0x prefix, pad to 32 bytes (64 hex chars)
    return address.toLowerCase().replace('0x', '').padStart(64, '0');
}

// ─── Fetch USDC balance on Polygon via raw JSON-RPC ─────────────────
/**
 * Fetch USDC balance for an EVM address on Polygon.
 * Uses raw JSON-RPC `eth_call` so we don't need ethers/viem at runtime.
 *
 * @param walletAddress  EVM address (0x...)
 * @param rpcUrl         Optional RPC override
 * @returns USDC balance as a human-readable number (e.g. 42.50)
 */
export async function fetchPolygonUsdcBalance(
    walletAddress: string,
    rpcUrl?: string,
): Promise<number> {
    const callData = ERC20_BALANCE_OF_SELECTOR + encodeAddress(walletAddress);

    // Query native USDC and bridged USDC.e in parallel
    const [nativeJson, bridgedJson] = await Promise.all([
        jsonRpcCall(
            JSON.stringify({
                jsonrpc: '2.0',
                id: 1,
                method: 'eth_call',
                params: [{ to: POLYGON_USDC_ADDRESS, data: callData }, 'latest'],
            }),
            rpcUrl,
        ),
        jsonRpcCall(
            JSON.stringify({
                jsonrpc: '2.0',
                id: 2,
                method: 'eth_call',
                params: [{ to: POLYGON_USDC_E_ADDRESS, data: callData }, 'latest'],
            }),
            rpcUrl,
        ),
    ]);

    // Both USDC and USDC.e have 6 decimals
    const nativeBalance = Number(BigInt(nativeJson.result || '0x0')) / 1e6;
    const bridgedBalance = Number(BigInt(bridgedJson.result || '0x0')) / 1e6;
    return nativeBalance + bridgedBalance;
}

// ─── Check if a Safe (or any contract) is deployed at an address ────
/**
 * Check if a contract (e.g. a Safe wallet) is deployed at the given address
 * by querying `eth_getCode`. Returns true if bytecode exists (not "0x").
 *
 * @param address  EVM address (0x...)
 * @param rpcUrl   Optional RPC override
 */
export async function isSafeDeployedOnChain(
    address: string,
    rpcUrl?: string,
): Promise<boolean> {
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getCode',
        params: [address, 'latest'],
    });
    try {
        const json = await jsonRpcCall(body, rpcUrl);
        const code = json.result || '0x';
        // If there's code beyond just "0x", the contract is deployed
        return code !== '0x' && code !== '0x0' && code.length > 2;
    } catch (err) {
        console.warn('[polygon] isSafeDeployedOnChain failed:', err);
        return false;
    }
}

// ─── Fetch native POL (MATIC) balance ───────────────────────────────
/**
 * Fetch native POL balance for an EVM address on Polygon.
 *
 * @param walletAddress  EVM address (0x...)
 * @param rpcUrl         Optional RPC override
 * @returns POL balance as a human-readable number
 */
export async function fetchPolygonNativeBalance(
    walletAddress: string,
    rpcUrl?: string,
): Promise<number> {
    const body = JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBalance',
        params: [walletAddress, 'latest'],
    });
    const json = await jsonRpcCall(body, rpcUrl);
    // POL/MATIC has 18 decimals
    return Number(BigInt(json.result || '0x0')) / 1e18;
}

// ─── Wait for a Polygon transaction receipt ─────────────────────────
/**
 * Poll for a transaction receipt on Polygon.
 *
 * @param txHash   Transaction hash (0x...)
 * @param rpcUrl   Optional RPC override
 * @param maxWait  Maximum wait time in ms (default: 60s)
 * @returns true if tx succeeded, false if reverted, null if timed out
 */
export async function waitForPolygonTx(
    txHash: string,
    rpcUrl?: string,
    maxWait = 60_000,
): Promise<boolean | null> {
    const start = Date.now();

    while (Date.now() - start < maxWait) {
        const body = JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_getTransactionReceipt',
            params: [txHash],
        });
        try {
            const json = await jsonRpcCall(body, rpcUrl);
            if (json.result) {
                return json.result.status === '0x1'; // 0x1 = success, 0x0 = revert
            }
        } catch {
            // ignore transient errors while polling
        }
        // Receipt not ready yet — wait 2 seconds
        await new Promise(r => setTimeout(r, 2000));
    }

    return null; // timed out
}
