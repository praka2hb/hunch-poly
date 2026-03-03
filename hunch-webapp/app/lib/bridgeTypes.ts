export interface BridgeToken {
  name: string;
  symbol: string;
  address: string;
  decimals: number;
}

export interface BridgeSupportedAsset {
  chainId: string;
  chainName: string;
  token: BridgeToken;
  minCheckoutUsd: number;
}

export interface BridgeFeeBreakdown {
  gasUsd?: number;
  appFeeLabel?: string;
  appFeePercent?: number;
  appFeeUsd?: number;
  fillCostPercent?: number;
  fillCostUsd?: number;
  maxSlippage?: number;
  minReceived?: number;
  swapImpact?: number;
  swapImpactUsd?: number;
  totalImpact?: number;
  totalImpactUsd?: number;
  [key: string]: unknown;
}

export interface BridgeQuoteResponse {
  estCheckoutTimeMs: number;
  estInputUsd: number;
  estOutputUsd: number;
  estToTokenBaseUnit: string;
  quoteId: string;
  estFeeBreakdown?: BridgeFeeBreakdown;
  [key: string]: unknown;
}

export interface BridgeWithdrawAddresses {
  address: Record<string, string>;
  note?: string;
}

/**
 * Convert a human-readable amount (e.g. 10.5) into base units as a string.
 * USDC/USDC.e use 6 decimals, so 10 → "10000000".
 */
export function toBaseUnits(
  humanAmount: number | string,
  decimals: number = 6,
): string {
  const value =
    typeof humanAmount === "string" ? parseFloat(humanAmount) : humanAmount;
  if (!Number.isFinite(value) || value <= 0) {
    return "0";
  }
  const factor = Math.pow(10, decimals);
  return Math.floor(value * factor).toString();
}

/**
 * Convert base units (e.g. "10000000") into a human-readable number.
 */
export function fromBaseUnits(
  rawAmount: string | number,
  decimals: number = 6,
): number {
  const value =
    typeof rawAmount === "string" ? parseInt(rawAmount, 10) : rawAmount;
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  const factor = Math.pow(10, decimals);
  return value / factor;
}

