/**
 * Jupiter Prediction API — types, formatting, and client fetch helpers.
 * All monetary values from the API are in micro-USD (divide by 1_000_000 for display).
 */

const INTERNAL_API_PREFIX = '/api/jupiter-prediction';
const USDC_DECIMALS = 1_000_000;

// --- Types (aligned with Jupiter Prediction API) ---

export interface PredictionEventMetadata {
  title?: string;
  subtitle?: string;
  isLive?: boolean;
  imageUrl?: string;
}

export interface PredictionEvent {
  eventId: string;
  category?: string;
  volumeUsd?: string;
  metadata?: PredictionEventMetadata;
}

export interface EventsResponse {
  data: PredictionEvent[];
  pagination: {
    start: number;
    end: number;
    total: number;
    hasNext: boolean;
  };
}

export interface EventMarketMetadata {
  title?: string;
  subtitle?: string;
  description?: string;
  isTradable?: boolean;
  closeTime?: number;
  openTime?: number;
  isTeamMarket?: boolean;
  rulesPrimary?: string;
  rulesSecondary?: string;
}

export interface EventMarketPricing {
  buyYesPriceUsd?: number;
  sellYesPriceUsd?: number;
  sellNoPriceUsd?: number;
  buyNoPriceUsd?: number;
  volume?: number;
  volume24h?: number;
  liquidityDollars?: number;
  openInterest?: number;
}

export interface EventMarket {
  marketId: string;
  status?: string;
  result?: string | null;
  openTime?: number;
  closeTime?: number;
  resolveAt?: number | null;
  metadata?: EventMarketMetadata;
  pricing?: EventMarketPricing;
}

export interface EventMarketsResponse {
  data: EventMarket[];
}

/** Full event detail returned by GET /events/{eventId}/markets */
export interface JupiterEventDetail {
  eventId: string;
  isActive?: boolean;
  beginAt?: string;
  category?: string;
  subcategory?: string;
  isRecommended?: boolean;
  isTrending?: boolean;
  metadata?: {
    slug?: string;
    title?: string;
    isLive?: boolean;
    series?: string;
    eventId?: string;
    imageUrl?: string;
    subtitle?: string;
    closeTime?: string;
  };
  markets?: EventMarket[];
  isLive?: boolean;
  volumeUsd?: string;
  closeCondition?: string;
  rulesPdf?: string;
}

export interface Profile {
  ownerPubkey: string;
  realizedPnlUsd?: number | string;
  totalVolumeUsd?: number | string;
  predictionsCount?: number;
  correctPredictions?: number;
  wrongPredictions?: number;
  totalActiveContracts?: number;
  totalPositionsValueUsd?: number | string;
}

export interface PnlHistoryPoint {
  timestamp: number;
  realizedPnlUsd: string;
}

export interface PnlHistoryResponse {
  data: PnlHistoryPoint[];
}

export interface Trade {
  ownerPubkey: string;
  eventId: string;
  marketId: string;
  action?: string;
  side?: string;
  contracts?: number;
  priceUsd?: number | string;
  amountUsd?: number | string;
  timestamp?: number;
  eventTitle?: string;
  marketTitle?: string;
  eventImageUrl?: string;
}

export interface TradesResponse {
  data: Trade[];
}

export interface LeaderboardEntry {
  rank: number;
  ownerPubkey: string;
  realizedPnlUsd?: number | string;
  totalVolumeUsd?: number | string;
  winRatePct?: number;
  predictionsCount?: number;
}

export interface LeaderboardsResponse {
  data: LeaderboardEntry[];
  summary?: {
    totalVolume?: number | string;
    totalPredictions?: number;
  };
}

/** Position from Jupiter GET /positions */
export interface JupiterPosition {
  pubkey: string;
  owner?: string;
  ownerPubkey?: string;
  market?: string;
  marketId: string;
  eventId?: string;
  marketIdHash?: string;
  isYes: boolean;
  contracts: string | number;
  totalCostUsd?: string;
  valueUsd?: string;
  sizeUsd?: string;
  avgPriceUsd?: string;
  markPriceUsd?: string;
  pnlUsd?: string | number;
  pnlUsdPercent?: number;
  pnlUsdAfterFees?: string | number;
  pnlUsdAfterFeesPercent?: number;
  sellPriceUsd?: string;
  payoutUsd?: string;
  claimable?: boolean;
  claimed?: boolean;
  claimableAt?: number | null;
  settlementDate?: number;
  eventMetadata?: {
    eventId?: string;
    title?: string;
    subtitle?: string;
    isActive?: boolean;
    beginAt?: string | null;
    category?: string;
    subcategory?: string;
    imageUrl?: string;
    isLive?: boolean;
    closeCondition?: string;
  };
  marketMetadata?: {
    marketId?: string;
    eventId?: string;
    title?: string;
    subtitle?: string;
    description?: string;
    status?: string;
    result?: string | null;
    closeTime?: number;
    openTime?: number;
  };
}

export interface PositionsResponse {
  data: JupiterPosition[];
  pagination?: {
    start: number;
    end: number;
    total: number;
    hasNext: boolean;
  };
}

// --- Formatting ---

/**
 * Format micro-USD (API value) for display with K/M/B suffixes.
 * Divides by 1_000_000 then formats (e.g. $83.60M).
 * Use for: volumeUsd, priceUsd, amountUsd, liquidityDollars, openInterest.
 */
export function formatMicroUsd(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  const usd = num / 1_000_000;
  return `$${Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(usd)}`;
}

/**
 * Format volume that is already in USD (no micro conversion).
 * Use for: market pricing.volume (Jupiter returns raw USD for volume).
 */
export function formatVolumeUsd(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(num)) return '—';
  return `$${Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 2,
    minimumFractionDigits: 0,
  }).format(num)}`;
}

// --- Client fetch helpers (call internal API only) ---

export async function fetchJupiterEvents(params: {
  includeMarkets?: boolean;
  category?: string;
  sortBy?: string;
  sortDirection?: 'asc' | 'desc';
  filter?: 'new' | 'live' | 'trending';
  start?: number;
  end?: number;
}): Promise<EventsResponse> {
  const searchParams = new URLSearchParams();
  if (params.includeMarkets !== undefined) searchParams.set('includeMarkets', String(params.includeMarkets));
  if (params.category) searchParams.set('category', params.category);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortDirection) searchParams.set('sortDirection', params.sortDirection);
  if (params.filter) searchParams.set('filter', params.filter);
  if (params.start !== undefined) searchParams.set('start', String(params.start));
  if (params.end !== undefined) searchParams.set('end', String(params.end));

  const url = `${INTERNAL_API_PREFIX}/events${searchParams.toString() ? `?${searchParams.toString()}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch events: ${res.statusText}`);
  return res.json();
}

/** Fetches full event detail (metadata, image, markets) from Jupiter. Use GET /events/:id with includeMarkets=true. */
export async function fetchJupiterEventDetail(eventId: string): Promise<JupiterEventDetail> {
  const res = await fetch(`${INTERNAL_API_PREFIX}/events/${encodeURIComponent(eventId)}?includeMarkets=true`);
  if (!res.ok) throw new Error(`Failed to fetch event: ${res.statusText}`);
  return res.json();
}

export async function fetchJupiterProfile(pubkey: string): Promise<Profile> {
  const res = await fetch(`${INTERNAL_API_PREFIX}/profiles/${encodeURIComponent(pubkey)}`);
  if (!res.ok) throw new Error(`Failed to fetch profile: ${res.statusText}`);
  return res.json();
}

export async function fetchJupiterPnlHistory(
  pubkey: string,
  params?: { interval?: '24h' | '1w' | '1m'; count?: number }
): Promise<PnlHistoryResponse> {
  const searchParams = new URLSearchParams();
  if (params?.interval) searchParams.set('interval', params.interval);
  if (params?.count !== undefined) searchParams.set('count', String(params.count));
  const qs = searchParams.toString();
  const url = `${INTERNAL_API_PREFIX}/profiles/${encodeURIComponent(pubkey)}/pnl-history${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch PnL history: ${res.statusText}`);
  return res.json();
}

export async function fetchJupiterPositions(ownerPubkey: string): Promise<PositionsResponse> {
  const url = `${INTERNAL_API_PREFIX}/positions?ownerPubkey=${encodeURIComponent(ownerPubkey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch positions: ${res.statusText}`);
  return res.json();
}

/** Close/sell an existing position via DELETE /positions/{positionPubkey}. */
export async function closeJupiterPosition(params: {
  positionPubkey: string;
  ownerPubkey: string;
}): Promise<CreateJupiterOrderResponse> {
  const res = await fetch(`${INTERNAL_API_PREFIX}/positions/${encodeURIComponent(params.positionPubkey)}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ownerPubkey: params.ownerPubkey }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? (data as { message?: string })?.message ?? 'Failed to close position';
    throw new Error(msg);
  }
  return data as CreateJupiterOrderResponse;
}

export async function fetchJupiterTrades(): Promise<TradesResponse> {
  const res = await fetch(`${INTERNAL_API_PREFIX}/trades`);
  if (!res.ok) throw new Error(`Failed to fetch trades: ${res.statusText}`);
  return res.json();
}

/** USDC mint — use as depositMint to place orders directly with USDC (no USDC→JupUSD swap). */
export const JUPITER_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
/** JupUSD mint for Jupiter Prediction vault balances. */
export const JUPITER_JUPUSD_MINT = 'JuprjznTrTSp2UFa3ZBUFgwdAmtZCq4MQCwysN55USD';

/** Request to create an order per Jupiter Create Order API. */
export interface CreateJupiterOrderRequest {
  ownerPubkey: string;
  marketId: string;
  isYes: boolean;
  isBuy: boolean;
  /** Required for BUY: amount in deposit token decimals (USDC = 6). */
  depositAmount?: string | number;
  /** Required for SELL: number of contracts to sell. */
  contracts?: string | number;
  /** Required for SELL: position PDA. */
  positionPubkey?: string;
  /** Deposit token mint. We default to USDC so orders use USDC directly (no JupUSD swap). */
  depositMint?: string;
}

/** Order details returned in Create Order response. */
export interface CreateOrderOrderDetails {
  orderPubkey: string;
  orderAtaPubkey: string;
  userPubkey: string;
  marketId: string;
  marketIdHash: string;
  positionPubkey: string;
  isBuy: boolean;
  isYes: boolean;
  contracts: string;
  newContracts: string;
  maxBuyPriceUsd: string | null;
  minSellPriceUsd: string | null;
  externalOrderId: string | null;
  orderCostUsd: string;
  newAvgPriceUsd: string;
  newSizeUsd: string;
  newPayoutUsd: string;
  estimatedProtocolFeeUsd: string;
  estimatedVenueFeeUsd: string;
  estimatedTotalFeeUsd: string;
}

/** Response from Jupiter Create Order API (POST /orders). */
export interface CreateJupiterOrderResponse {
  transaction: string | null;
  txMeta: { blockhash: string; lastValidBlockHeight: number } | null;
  externalOrderId: string | null;
  order: CreateOrderOrderDetails;
}

export type PersistJupiterTradeRequest = {
  ownerPubkey: string;
  marketId: string;
  eventId?: string;
  marketIdHash?: string;
  isYes: boolean;
  isBuy: boolean;
  amount: string;
  executedInAmount?: string;
  executedOutAmount?: string;
  transactionSig: string;
  quote?: string;
  entryPrice?: number | string | null;
  provider?: string;
  externalOrderId?: string | null;
  orderPubkey?: string | null;
  positionPubkey?: string | null;
};

/**
 * Create a Jupiter Prediction order (buy or sell).
 * Uses USDC as depositMint so orders are placed directly with USDC (no USDC→JupUSD swap).
 * BUY: ownerPubkey, marketId, isYes, isBuy: true, depositAmount (USDC 6 decimals).
 * SELL: ownerPubkey, marketId, positionPubkey, isYes, isBuy: false, contracts.
 * @see https://dev.jup.ag/api-reference/prediction/create-order
 */
export async function createJupiterOrder(
  params: CreateJupiterOrderRequest
): Promise<CreateJupiterOrderResponse> {
  const body: Record<string, unknown> = {
    ownerPubkey: params.ownerPubkey,
    marketId: params.marketId,
    isYes: params.isYes,
    isBuy: params.isBuy,
    depositMint: params.depositMint ?? JUPITER_USDC_MINT, // USDC: avoid swap
  };
  if (params.isBuy) {
    if (params.depositAmount == null) throw new Error('depositAmount is required for buy orders');
    body.depositAmount = params.depositAmount;
  } else {
    if (!params.positionPubkey || params.positionPubkey.length < 32)
      throw new Error('positionPubkey is required for sell orders');
    if (params.contracts == null) throw new Error('contracts is required for sell orders');
    body.positionPubkey = params.positionPubkey;
    body.contracts = params.contracts;
  }
  const res = await fetch(`${INTERNAL_API_PREFIX}/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg = (data as { error?: string })?.error ?? (data as { message?: string })?.message ?? 'Failed to create order';
    throw new Error(msg);
  }
  return data as CreateJupiterOrderResponse;
}

export function toUsdDecimalString(amountSmallestUnit: string | number | undefined | null): string | undefined {
  if (amountSmallestUnit === undefined || amountSmallestUnit === null) return undefined;
  const n = Number(amountSmallestUnit);
  if (!Number.isFinite(n)) return undefined;
  return (n / USDC_DECIMALS).toFixed(6);
}

export async function waitForConfirmedSignature(
  connection: import('@solana/web3.js').Connection,
  signature: string,
  maxAttempts: number = 30
) {
  let attempts = 0;
  while (attempts < maxAttempts) {
    const statusResult = await connection.getSignatureStatuses([signature]);
    const confirmationStatus = statusResult.value[0];

    if (confirmationStatus?.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmationStatus.err)}`);
    }

    if (
      confirmationStatus &&
      (confirmationStatus.confirmationStatus === 'confirmed' ||
        confirmationStatus.confirmationStatus === 'finalized')
    ) {
      return confirmationStatus;
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
    attempts++;
  }

  throw new Error('Transaction confirmation timeout - transaction may still be processing');
}

export async function persistJupiterTrade(params: PersistJupiterTradeRequest) {
  const res = await fetch(`${INTERNAL_API_PREFIX}/trades`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg =
      (data as { error?: string })?.error ??
      (data as { message?: string })?.message ??
      'Failed to persist Jupiter trade';
    throw new Error(msg);
  }
  return data;
}

export async function fetchJupiterLeaderboards(params?: {
  period?: 'all_time' | 'weekly' | 'monthly';
  metric?: 'pnl' | 'volume' | 'win_rate';
  limit?: number;
}): Promise<LeaderboardsResponse> {
  const searchParams = new URLSearchParams();
  if (params?.period) searchParams.set('period', params.period);
  if (params?.metric) searchParams.set('metric', params.metric);
  if (params?.limit !== undefined) searchParams.set('limit', String(params.limit));
  const qs = searchParams.toString();
  const url = `${INTERNAL_API_PREFIX}/leaderboards${qs ? `?${qs}` : ''}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch leaderboards: ${res.statusText}`);
  return res.json();
}
