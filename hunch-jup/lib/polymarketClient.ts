/**
 * Polymarket client helpers for the Expo app.
 *
 * These handle RelayClient initialization, approval transaction building,
 * and CLOB API credential derivation — all of which require the user's
 * Privy embedded wallet to sign transactions.
 */

import { api, API_BASE_URL } from './api';

// ─── Contract Addresses (Polygon mainnet) ──────────────────────────────

export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';
export const CTF_CONTRACT = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';
export const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';
export const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';
export const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

const POLYGON_CHAIN_ID = 137;

// ERC-20 approve(address spender, uint256 amount) function selector
const ERC20_APPROVE_SELECTOR = '0x095ea7b3';
// ERC-1155 setApprovalForAll(address operator, bool approved) function selector
const ERC1155_SET_APPROVAL_SELECTOR = '0xa22cb465';
// MaxUint256 for ERC-20 approvals
const MAX_UINT256 = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';
// "true" encoded as ABI bool for ERC-1155
const TRUE_ENCODED = '0x0000000000000000000000000000000000000000000000000000000000000001';

// ─── Remote Builder Config ─────────────────────────────────────────────

// Route through our backend so the app never contacts polymarket.com directly
// (Polymarket is blocked in some regions, e.g. India).
const RELAYER_URL = `${API_BASE_URL}/api/polymarket/relayer-proxy`;
const CLOB_PROXY_URL = `${API_BASE_URL}/api/polymarket/clob-proxy`;

/**
 * Create a remote builder config for RelayClient.
 * Points to our backend's /api/polymarket/sign endpoint so that
 * builder credentials never leave the server.
 */
export function getRemoteBuilderConfig(): { url: string } {
    // RemoteBuilderConfig expects a URL. Our backend sign endpoint acts as
    // the remote builder signer.
    return {
        url: `${API_BASE_URL}/api/polymarket/sign`,
    };
}

/**
 * Build a BuilderConfig from our remote builder config.
 */
async function createBuilderConfig() {
    const { BuilderConfig } = await import('@polymarket/builder-signing-sdk');
    return new BuilderConfig({
        remoteBuilderConfig: getRemoteBuilderConfig(),
    });
}

// ─── Safe Address Derivation ────────────────────────────────────────────

/**
 * Derive the deterministic Safe address from an EOA using the SDK.
 * Matches the reference implementation from @polymarket/builder-relayer-client.
 */
export async function deriveSafeAddress(eoaAddress: string): Promise<string> {
    const { deriveSafe } = await import(
        '@polymarket/builder-relayer-client/dist/builder/derive'
    );
    const { getContractConfig } = await import(
        '@polymarket/builder-relayer-client/dist/config'
    );
    const config = getContractConfig(POLYGON_CHAIN_ID);
    return deriveSafe(eoaAddress, config.SafeContracts.SafeFactory);
}

// ─── RelayClient Initialization ────────────────────────────────────────

/**
 * Initialize a RelayClient with the user's Privy wallet as signer and
 * builder signing proxied through our backend.
 *
 * RelayClient constructor: (relayerUrl, chainId, signer?, builderConfig?, relayTxType?)
 *
 * @param signer - ethers Signer from the Privy embedded wallet
 * @param safeAddress - The user's derived Safe address (unused directly by RelayClient constructor,
 *                       but the signer's address determines the Safe)
 */
export async function getRelayClient(signer: any, _safeAddress: string) {
    const { RelayClient } = await import('@polymarket/builder-relayer-client');

    const builderConfig = await createBuilderConfig();

    const relayClient = new RelayClient(
        RELAYER_URL,
        POLYGON_CHAIN_ID,
        signer,
        builderConfig,
    );

    return relayClient;
}

// ─── Approval Transactions ─────────────────────────────────────────────

/**
 * ABI-encode an ERC-20 approve(spender, amount) call.
 */
function encodeErc20Approve(spender: string): string {
    const paddedSpender = spender.toLowerCase().replace('0x', '').padStart(64, '0');
    const paddedAmount = MAX_UINT256.replace('0x', '');
    return `${ERC20_APPROVE_SELECTOR}${paddedSpender}${paddedAmount}`;
}

/**
 * ABI-encode an ERC-1155 setApprovalForAll(operator, true) call.
 */
function encodeErc1155SetApprovalForAll(operator: string): string {
    const paddedOperator = operator.toLowerCase().replace('0x', '').padStart(64, '0');
    const paddedApproved = TRUE_ENCODED.replace('0x', '');
    return `${ERC1155_SET_APPROVAL_SELECTOR}${paddedOperator}${paddedApproved}`;
}

/**
 * Build the 7 approval transactions required before trading.
 *
 * 4 ERC-20 USDC approvals:
 *   - USDC → CTF_CONTRACT
 *   - USDC → CTF_EXCHANGE
 *   - USDC → NEG_RISK_CTF_EXCHANGE
 *   - USDC → NEG_RISK_ADAPTER
 *
 * 3 ERC-1155 outcome token approvals:
 *   - CTF_CONTRACT → CTF_EXCHANGE
 *   - CTF_CONTRACT → NEG_RISK_CTF_EXCHANGE
 *   - CTF_CONTRACT → NEG_RISK_ADAPTER
 */
export function buildApprovalTransactions() {
    return [
        // ERC-20 USDC approvals
        {
            to: USDC_E_ADDRESS,
            operation: 0, // OperationType.Call
            data: encodeErc20Approve(CTF_CONTRACT),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            operation: 0,
            data: encodeErc20Approve(CTF_EXCHANGE),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            operation: 0,
            data: encodeErc20Approve(NEG_RISK_CTF_EXCHANGE),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            operation: 0,
            data: encodeErc20Approve(NEG_RISK_ADAPTER),
            value: '0',
        },
        // ERC-1155 outcome token approvals
        {
            to: CTF_CONTRACT,
            operation: 0,
            data: encodeErc1155SetApprovalForAll(CTF_EXCHANGE),
            value: '0',
        },
        {
            to: CTF_CONTRACT,
            operation: 0,
            data: encodeErc1155SetApprovalForAll(NEG_RISK_CTF_EXCHANGE),
            value: '0',
        },
        {
            to: CTF_CONTRACT,
            operation: 0,
            data: encodeErc1155SetApprovalForAll(NEG_RISK_ADAPTER),
            value: '0',
        },
    ];
}

// ─── CLOB API Credential Derivation ────────────────────────────────────

/**
 * Derive or create Polymarket CLOB API credentials using the user's Privy wallet.
 *
 * Tries deriveApiKey() first (for returning users whose key already exists
 * on Polymarket's side), falls back to createApiKey() for new users.
 *
 * @param signer - ethers Signer from the Privy embedded wallet
 * @returns { key, secret, passphrase }
 */
export async function deriveOrCreateApiKey(signer: any): Promise<{
    key: string;
    secret: string;
    passphrase: string;
}> {
    const { ClobClient } = await import('@polymarket/clob-client');

    const clobClient = new ClobClient(
        CLOB_PROXY_URL,
        POLYGON_CHAIN_ID,
        signer,
    );

    try {
        // Try deriving first (for existing users)
        const derived = await clobClient.deriveApiKey();
        if (derived?.key && derived?.secret && derived?.passphrase) {
            return {
                key: derived.key,
                secret: derived.secret,
                passphrase: derived.passphrase,
            };
        }
    } catch (err) {
        console.log('[polymarketClient] deriveApiKey failed, trying createApiKey:', err);
    }

    // Fall back to creating a new key
    const created = await clobClient.createApiKey();
    if (!created?.key || !created?.secret || !created?.passphrase) {
        throw new Error('Failed to derive or create Polymarket API credentials');
    }

    return {
        key: created.key,
        secret: created.secret,
        passphrase: created.passphrase,
    };
}

// ─── EIP-712 Signed Order Creation for Polymarket CLOB ─────────────────

// Local ClobSide definition — mirrors the Side enum from @polymarket/clob-client.
// We intentionally do NOT re-export from that package at the top level because
// @polymarket/clob-client bundles `browser-or-node` which accesses
// `navigator.userAgent` at module-load time and crashes in React Native.
// All actual clob-client imports are kept inside async functions (dynamic import)
// so they only execute when a trade is placed, after polyfills are in place.
export const ClobSide = {
    BUY: 'BUY' as const,
    SELL: 'SELL' as const,
} as const;
export type ClobSideValue = typeof ClobSide[keyof typeof ClobSide];

// Internal type alias — resolved lazily inside functions
type Side = 'BUY' | 'SELL';

export interface CreateClobOrderParams {
    /** ethers Signer from the Privy embedded wallet */
    signer: any;
    /** User's CLOB API credentials (key, secret, passphrase) */
    creds: { key: string; secret: string; passphrase: string };
    /** Derived Safe proxy address — used as the maker in EIP-712 signatures */
    safeAddress: string;
    /** The YES or NO tokenId for the market (from Gamma API) */
    tokenId: string;
    /** Side.BUY or Side.SELL */
    side: Side;
    /** Price between 0 and 1 (e.g. 0.55 for 55¢) */
    price: number;
    /** Size in outcome token units (e.g. 100 = 100 shares) */
    size: number;
    /** Fee rate in basis points — usually 0 for takers, check CLOB */
    feeRateBps?: number;
    /** Nonce — if omitted, ClobClient generates one */
    nonce?: number;
    /** Expiration unix timestamp — if omitted, ClobClient generates one */
    expiration?: number;
    /** Tick size for the market: "0.1" | "0.01" | "0.001" | "0.0001" */
    tickSize?: '0.1' | '0.01' | '0.001' | '0.0001';
    /** Whether this is a neg-risk market (multi-outcome event) */
    negRisk?: boolean;
}

/**
 * Create a ClobClient instance configured for the user's wallet + credentials.
 * The Safe address is required so EIP-712 signatures use the Safe as maker.
 * BuilderConfig provides builder order attribution via remote signing.
 */
async function makeClobClient(
    signer: any,
    creds: { key: string; secret: string; passphrase: string },
    safeAddress: string,
) {
    const { ClobClient } = await import('@polymarket/clob-client');
    const builderConfig = await createBuilderConfig();
    return new ClobClient(
        CLOB_PROXY_URL,
        POLYGON_CHAIN_ID,
        signer,
        { key: creds.key, secret: creds.secret, passphrase: creds.passphrase },
        2, // signatureType = POLY_GNOSIS_SAFE (EOA signs on behalf of Safe)
        safeAddress,
        undefined, // mandatory placeholder
        false,
        builderConfig,
    );
}

/**
 * Create a signed Polymarket CLOB limit order (GTC).
 *
 * This uses `ClobClient.createOrder()` which internally:
 * 1. Builds the EIP-712 typed data for the CTF Exchange
 * 2. Signs it with the provided signer (Privy embedded wallet)
 * 3. Returns the complete signed order object ready for POST /order
 *
 * @returns The signed order object (ready to submit to CLOB /order endpoint)
 */
export async function createSignedClobOrder(params: CreateClobOrderParams): Promise<any> {
    const clobClient = await makeClobClient(params.signer, params.creds, params.safeAddress);

    console.log('[polymarketClient] Creating signed CLOB order:', {
        tokenId: params.tokenId,
        side: params.side,
        price: params.price,
        size: params.size,
        tickSize: params.tickSize,
        negRisk: params.negRisk,
    });

    const signedOrder = await clobClient.createOrder(
        {
            tokenID: params.tokenId,
            side: params.side as any,
            price: params.price,
            size: params.size,
            feeRateBps: params.feeRateBps ?? 0,
            nonce: params.nonce,
            expiration: params.expiration,
        },
        {
            tickSize: params.tickSize || '0.01',
            negRisk: params.negRisk,
        },
    );

    console.log('[polymarketClient] Order signed successfully');
    return signedOrder;
}

/**
 * Create a signed Polymarket CLOB market order (FOK — fill-or-kill).
 *
 * Market orders execute immediately at the best available price.
 * Used for instant buys/sells without specifying an exact price.
 *
 * @returns The signed order object
 */
export async function createSignedClobMarketOrder(params: Omit<CreateClobOrderParams, 'price'> & { price?: number }): Promise<any> {
    const clobClient = await makeClobClient(params.signer, params.creds, params.safeAddress);

    console.log('[polymarketClient] Creating signed CLOB market order:', {
        tokenId: params.tokenId,
        side: params.side,
        size: params.size,
    });

    const signedOrder = await clobClient.createMarketOrder(
        {
            tokenID: params.tokenId,
            side: params.side as any,
            price: params.price,
            amount: params.size,
            feeRateBps: params.feeRateBps ?? 0,
            nonce: params.nonce,
        },
        {
            tickSize: params.tickSize || '0.01',
            negRisk: params.negRisk,
        },
    );

    console.log('[polymarketClient] Market order signed successfully');
    return signedOrder;
}

/**
 * Create, sign, AND post a limit order to the Polymarket CLOB in one step.
 *
 * Uses `ClobClient.createAndPostOrder()` which handles EIP-712 signing
 * and HTTP submission with HMAC auth in a single call.
 *
 * Use this for the simplest trade flow. If you need builder attribution,
 * use `createSignedClobOrder()` instead and relay via `/api/polymarket/order`.
 *
 * @returns CLOB response (with orderID, status, etc.)
 */
export async function createAndPostClobOrder(params: CreateClobOrderParams): Promise<any> {
    const clobClient = await makeClobClient(params.signer, params.creds, params.safeAddress);

    console.log('[polymarketClient] Creating and posting CLOB order:', {
        tokenId: params.tokenId,
        side: params.side,
        price: params.price,
        size: params.size,
    });

    const result = await clobClient.createAndPostOrder(
        {
            tokenID: params.tokenId,
            side: params.side as any,
            price: params.price,
            size: params.size,
            feeRateBps: params.feeRateBps ?? 0,
            nonce: params.nonce,
            expiration: params.expiration,
        },
        {
            tickSize: params.tickSize || '0.01',
            negRisk: params.negRisk,
        },
    );

    console.log('[polymarketClient] Order posted to CLOB:', result);
    return result;
}

/**
 * Create, sign, AND post a market order (FOK) to the Polymarket CLOB.
 *
 * @returns CLOB response
 */
export async function createAndPostClobMarketOrder(params: Omit<CreateClobOrderParams, 'price'> & { price?: number }): Promise<any> {
    const clobClient = await makeClobClient(params.signer, params.creds, params.safeAddress);

    console.log('[polymarketClient] Creating and posting CLOB market order:', {
        tokenId: params.tokenId,
        side: params.side,
        size: params.size,
    });

    const result = await clobClient.createAndPostMarketOrder(
        {
            tokenID: params.tokenId,
            side: params.side as any,
            price: params.price,
            amount: params.size,
            feeRateBps: params.feeRateBps ?? 0,
            nonce: params.nonce,
        },
        {
            tickSize: params.tickSize || '0.01',
            negRisk: params.negRisk,
        },
    );

    console.log('[polymarketClient] Market order posted to CLOB:', result);
    return result;
}
