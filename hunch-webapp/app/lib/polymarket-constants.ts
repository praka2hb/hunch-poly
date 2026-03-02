/**
 * Polymarket contract addresses on Polygon mainnet.
 * These are hardcoded — they are protocol-level constants.
 */

// USDC (bridged) on Polygon
export const USDC_E_ADDRESS = '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174';

// Conditional Tokens Framework contract
export const CTF_CONTRACT = '0x4d97dcd97ec945f40cf65f87097ace5ea0476045';

// CTF Exchange (order matching)
export const CTF_EXCHANGE = '0x4bFb41d5B3570DeFd03C39a9A4D8dE6Bd8B8982E';

// Neg Risk CTF Exchange
export const NEG_RISK_CTF_EXCHANGE = '0xC5d563A36AE78145C45a50134d48A1215220f80a';

// Neg Risk Adapter
export const NEG_RISK_ADAPTER = '0xd91E80cF2E7be2e162c6513ceD06f1dD0dA35296';

// Polygon chain config
export const POLYGON_CHAIN_ID = 137;
export const POLYGON_RPC_URL = process.env.ALCHEMY_POLYGON_RPC || 'https://polygon-rpc.com';

// Polymarket CLOB
export const CLOB_BASE_URL = process.env.POLYMARKET_CLOB_URL || 'https://clob.polymarket.com';
