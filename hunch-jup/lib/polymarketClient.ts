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
        'SAFE' as any,
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
            data: encodeErc20Approve(CTF_CONTRACT),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            data: encodeErc20Approve(CTF_EXCHANGE),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            data: encodeErc20Approve(NEG_RISK_CTF_EXCHANGE),
            value: '0',
        },
        {
            to: USDC_E_ADDRESS,
            data: encodeErc20Approve(NEG_RISK_ADAPTER),
            value: '0',
        },
        // ERC-1155 outcome token approvals
        {
            to: CTF_CONTRACT,
            data: encodeErc1155SetApprovalForAll(CTF_EXCHANGE),
            value: '0',
        },
        {
            to: CTF_CONTRACT,
            data: encodeErc1155SetApprovalForAll(NEG_RISK_CTF_EXCHANGE),
            value: '0',
        },
        {
            to: CTF_CONTRACT,
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
        undefined, // no creds yet
        2, // signatureType = POLY_GNOSIS_SAFE
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
