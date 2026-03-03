import {
  BridgeQuoteResponse,
  BridgeSupportedAsset,
  BridgeWithdrawAddresses,
  toBaseUnits,
} from "./bridgeTypes";
import {
  POLYGON_CHAIN_ID,
  USDC_E_ADDRESS,
} from "./polymarket-constants";

const BRIDGE_PROXY_BASE = "/api/polymarket/bridge-proxy";

function buildUrl(path: string, origin?: string) {
  if (origin) {
    return `${origin}${path}`;
  }
  if (typeof window !== "undefined") {
    return path;
  }
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  return appUrl ? `${appUrl}${path}` : path;
}

export async function getBridgeSupportedAssets(
  origin?: string,
): Promise<BridgeSupportedAsset[]> {
  const response = await fetch(
    buildUrl(`${BRIDGE_PROXY_BASE}/supported-assets`, origin),
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch supported assets: ${response.status} ${errorText}`,
    );
  }

  const json = await response.json();
  // Upstream may return { supportedAssets: [...] } or the array directly
  const assets = (json.supportedAssets ??
    json) as BridgeSupportedAsset[] | undefined;
  if (!Array.isArray(assets)) {
    throw new Error("Invalid supported-assets response from bridge");
  }
  return assets;
}

export interface BridgeQuoteParams {
  amountUsd: number;
  toChainId: string;
  toTokenAddress: string;
  recipientAddress: string;
  origin?: string;
}

export async function getBridgeQuote(
  params: BridgeQuoteParams,
): Promise<BridgeQuoteResponse> {
  const {
    amountUsd,
    toChainId,
    toTokenAddress,
    recipientAddress,
    origin,
  } = params;

  const fromAmountBaseUnit = toBaseUnits(amountUsd, 6);

  const body = {
    fromAmountBaseUnit,
    fromChainId: String(POLYGON_CHAIN_ID),
    fromTokenAddress: USDC_E_ADDRESS,
    recipientAddress,
    toChainId: String(toChainId),
    toTokenAddress,
  };

  const response = await fetch(
    buildUrl(`${BRIDGE_PROXY_BASE}/quote`, origin),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to fetch bridge quote: ${response.status} ${errorText}`,
    );
  }

  const json = (await response.json()) as BridgeQuoteResponse;
  return json;
}

export interface CreateWithdrawAddressesParams {
  safeAddress: string;
  toChainId: string;
  toTokenAddress: string;
  recipientAddress: string;
  origin?: string;
}

export async function createWithdrawAddresses(
  params: CreateWithdrawAddressesParams,
): Promise<BridgeWithdrawAddresses> {
  const {
    safeAddress,
    toChainId,
    toTokenAddress,
    recipientAddress,
    origin,
  } = params;

  const body = {
    address: safeAddress,
    toChainId: String(toChainId),
    toTokenAddress,
    recipientAddr: recipientAddress,
  };

  const response = await fetch(
    buildUrl(`${BRIDGE_PROXY_BASE}/withdraw`, origin),
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Failed to create withdraw addresses: ${response.status} ${errorText}`,
    );
  }

  const json = await response.json();
  return json as BridgeWithdrawAddresses;
}

