// Internal API route prefix - all DFlow calls now go through server-side routes
// This prevents exposing external API endpoints in the client bundle
// On server-side, we need absolute URLs; on client-side, relative URLs work
const getBaseUrl = () => {
  // Server-side: use absolute URL
  if (typeof window === 'undefined') {
    // Use NEXT_PUBLIC_APP_URL if set, otherwise construct from localhost
    return process.env.NEXT_PUBLIC_APP_URL || `http://localhost:${process.env.PORT || 3000}`;
  }
  // Client-side: use relative URL (empty string)
  return '';
};

const INTERNAL_API_PREFIX = `${getBaseUrl()}/api/dflow`;

// Platform fee configuration
// Set NEXT_PUBLIC_ENABLE_PLATFORM_FEES=true in .env to enable platform fees
const ENABLE_PLATFORM_FEES = process.env.NEXT_PUBLIC_ENABLE_PLATFORM_FEES === 'true';
const PLATFORM_FEE_SCALE = '50'; // 50 bps (0.5%)
const PLATFORM_FEE_ACCOUNT = 'CjH6XsvFD6poErKvN8fj7hxEUKj2t2xeP5xHRo9Lzys2';

export interface OrderRequest {
  userPublicKey: string;
  inputMint: string;
  outputMint: string;
  amount: string;
  slippageBps?: number;
}

export interface OrderPreviewRequest {
  inputMint: string;
  outputMint: string;
  amount: string;
}

export interface OrderResponse {
  transaction?: string; // Base64 encoded transaction (new API format)
  openTransaction?: string; // Base64 encoded transaction (legacy format)
  executionMode: "sync" | "async";
  inAmount: string;
  outAmount: string;
  inputMint: string;
  outputMint: string;
  lastValidBlockHeight?: number;
  prioritizationFeeLamports?: number;
  computeUnitLimit?: number;
  [key: string]: any;
}

export interface OrderStatusResponse {
  status: "open" | "pendingClose" | "closed" | "failed";
  fills?: Array<{
    qtyIn: string;
    qtyOut: string;
    [key: string]: any;
  }>;
  [key: string]: any;
}

export interface IntentResponse {
  openTransaction: string; // Base64 encoded transaction
  [key: string]: any;
}

export interface SubmitIntentRequest {
  quoteResponse: IntentResponse;
  signedOpenTransaction: string; // Base64 encoded signed transaction
}

/**
 * Request an order from the Trade API (via internal route)
 */
export async function requestOrder(params: OrderRequest): Promise<OrderResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append("userPublicKey", params.userPublicKey);
  queryParams.append("inputMint", params.inputMint);
  queryParams.append("outputMint", params.outputMint);
  queryParams.append("amount", params.amount);

  // Slippage is required for prediction markets, default to 100 bps (1%) if not provided
  const slippageBps = params.slippageBps ?? 100;
  queryParams.append("slippageBps", slippageBps.toString());

  // Add platform fee parameters only if enabled
  // Set NEXT_PUBLIC_ENABLE_PLATFORM_FEES=true in .env to enable
  if (ENABLE_PLATFORM_FEES) {
    queryParams.append("platformFeeScale", PLATFORM_FEE_SCALE);
    queryParams.append("feeAccount", PLATFORM_FEE_ACCOUNT);
  }

  const url = `${INTERNAL_API_PREFIX}/quote?${queryParams.toString()}`;

  // Log for debugging - verify URL format matches expected format
  console.log('Requesting order:', {
    url,
    params: {
      userPublicKey: params.userPublicKey,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      amount: params.amount,
      slippageBps,
      platformFeesEnabled: ENABLE_PLATFORM_FEES,
      ...(ENABLE_PLATFORM_FEES && {
        platformFeeScale: PLATFORM_FEE_SCALE,
        feeAccount: PLATFORM_FEE_ACCOUNT,
      }),
    },
    // Verify all required params are present
    hasAllParams: {
      userPublicKey: !!params.userPublicKey,
      inputMint: !!params.inputMint,
      outputMint: !!params.outputMint,
      amount: !!params.amount,
      slippageBps: !!slippageBps,
    },
  });

  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to request order: ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.msg) {
        errorMessage = errorJson.msg;
      } else if (errorJson.message) {
        errorMessage = errorJson.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      }

      // Provide helpful error messages
      if (errorJson.code === 'route_not_found') {
        errorMessage = `No trading route found for this token pair. The market may not have sufficient liquidity or the tokens may not be tradeable.`;
      }
    } catch (e) {
      // If errorText is not JSON, use it as is
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }

    throw new Error(errorMessage);
  }

  const data = await response.json();
  console.log('Order response:', {
    hasTransaction: !!data.transaction,
    hasOpenTransaction: !!data.openTransaction,
    executionMode: data.executionMode,
    inAmount: data.inAmount,
    outAmount: data.outAmount,
    inputMint: data.inputMint,
    outputMint: data.outputMint,
  });
  return data;
}

/**
 * Request a lightweight quote preview without sponsorship or fees.
 */
export async function requestOrderPreview(
  params: OrderPreviewRequest
): Promise<OrderResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append("inputMint", params.inputMint);
  queryParams.append("outputMint", params.outputMint);
  queryParams.append("amount", params.amount);

  const url = `${INTERNAL_API_PREFIX}/quote-preview?${queryParams.toString()}`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    let errorMessage = `Failed to request quote preview: ${response.statusText}`;

    try {
      const errorJson = JSON.parse(errorText);
      if (errorJson.msg) {
        errorMessage = errorJson.msg;
      } else if (errorJson.message) {
        errorMessage = errorJson.message;
      } else if (errorJson.error) {
        errorMessage = errorJson.error;
      }
    } catch (e) {
      if (errorText) {
        errorMessage += ` - ${errorText}`;
      }
    }

    throw new Error(errorMessage);
  }

  return await response.json();
}

/**
 * Get order status for async trades
 * Note: This still needs a server-side implementation; for now using inline placeholder
 */
export async function getOrderStatus(signature: string): Promise<OrderStatusResponse> {
  // TODO: Create /api/dflow/order-status route when needed
  const response = await fetch(
    `${INTERNAL_API_PREFIX}/order-status?signature=${signature}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get order status: ${response.statusText}`);
  }

  return await response.json();
}

/**
 * Request a swap intent (for declarative swaps)
 * Note: This still needs a server-side implementation; for now using inline placeholder
 */
export async function requestSwapIntent(params: {
  inputMint: string;
  outputMint: string;
  amount: string;
  userPublicKey: string;
  slippageBps?: number;
}): Promise<IntentResponse> {
  const queryParams = new URLSearchParams();
  queryParams.append("inputMint", params.inputMint);
  queryParams.append("outputMint", params.outputMint);
  queryParams.append("amount", params.amount);
  queryParams.append("userPublicKey", params.userPublicKey);

  if (params.slippageBps) {
    queryParams.append("slippageBps", params.slippageBps.toString());
  }

  // TODO: Create /api/dflow/intent route when needed
  const response = await fetch(
    `${INTERNAL_API_PREFIX}/intent?${queryParams.toString()}`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to request swap intent: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

/**
 * Submit a signed swap intent
 * Note: This still needs a server-side implementation; for now using inline placeholder
 */
export async function submitSwapIntent(request: SubmitIntentRequest): Promise<any> {
  // TODO: Create /api/dflow/submit-intent route when needed
  const response = await fetch(`${INTERNAL_API_PREFIX}/submit-intent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to submit swap intent: ${response.statusText} - ${errorText}`);
  }

  return await response.json();
}

// Common mint addresses
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
