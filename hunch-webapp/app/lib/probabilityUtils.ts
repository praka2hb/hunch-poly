import { requestOrder, USDC_MINT } from './tradeApi';
import { Market } from './api';

export interface MarketProbabilities {
  yesProbability: number | null;
  noProbability: number | null;
  loading: boolean;
  error: string | null;
}

/**
 * Get mint address from market for YES or NO token
 */
function getMintAddress(market: Market, type: 'yes' | 'no'): string | undefined {
  if (market.accounts && typeof market.accounts === 'object') {
    const usdcAccount = (market.accounts as any)[USDC_MINT];
    if (usdcAccount) {
      const mint = type === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
      if (mint) return mint;
    }
    
    const accountKeys = Object.keys(market.accounts);
    for (const key of accountKeys) {
      const account = (market.accounts as any)[key];
      if (account && typeof account === 'object') {
        const mint = type === 'yes' ? account.yesMint : account.noMint;
        if (mint) return mint;
      }
    }
  }
  
  const mint = type === 'yes' ? market.yesMint : market.noMint;
  return mint;
}

/**
 * Calculate probabilities from market bid/ask prices if available
 * Falls back to fetching quotes if bid/ask not available
 * Handles partial data (e.g., only bid or only ask available)
 */
function calculateProbabilitiesFromPrices(market: Market): { yesProb: number | null; noProb: number | null } {
  let yesPrice: number | null = null;
  let noPrice: number | null = null;

  // Calculate YES price - prefer mid-price, fallback to available value
  if (market.yesBid && market.yesAsk) {
    // Both available: use mid-price
    yesPrice = (parseFloat(market.yesBid) + parseFloat(market.yesAsk)) / 2;
  } else if (market.yesBid) {
    // Only bid available
    yesPrice = parseFloat(market.yesBid);
  } else if (market.yesAsk) {
    // Only ask available
    yesPrice = parseFloat(market.yesAsk);
  }

  // Calculate NO price - prefer mid-price, fallback to available value
  if (market.noBid && market.noAsk) {
    // Both available: use mid-price
    noPrice = (parseFloat(market.noBid) + parseFloat(market.noAsk)) / 2;
  } else if (market.noBid) {
    // Only bid available
    noPrice = parseFloat(market.noBid);
  } else if (market.noAsk) {
    // Only ask available
    noPrice = parseFloat(market.noAsk);
  }

  // Convert prices to probabilities (0-1 to 0-100%)
  let yesProb: number | null = yesPrice !== null ? yesPrice * 100 : null;
  let noProb: number | null = noPrice !== null ? noPrice * 100 : null;

  // If we have both probabilities, normalize to sum to 100%
  if (yesProb !== null && noProb !== null) {
    const total = yesProb + noProb;
    if (total > 0) {
      return {
        yesProb: (yesProb / total) * 100,
        noProb: (noProb / total) * 100,
      };
    }
  }

  // If we only have one probability, calculate the complement
  if (yesProb !== null && yesProb >= 0 && yesProb <= 100) {
    return {
      yesProb,
      noProb: 100 - yesProb,
    };
  }

  if (noProb !== null && noProb >= 0 && noProb <= 100) {
    return {
      yesProb: 100 - noProb,
      noProb,
    };
  }

  return { yesProb: null, noProb: null };
}

/**
 * Fetch market probabilities by getting quotes for YES and NO tokens
 * Uses a small amount (0.01 USDC) to get the exchange rate
 * Prefers using yesBid/yesAsk/noBid/noAsk from market details if available
 */
export async function fetchMarketProbabilities(
  market: Market,
  dummyPublicKey: string = '11111111111111111111111111111111' // Dummy key for quote only
): Promise<MarketProbabilities> {
  // First, try to use bid/ask prices if available (more reliable and faster)
  const priceBasedProbs = calculateProbabilitiesFromPrices(market);
  if (priceBasedProbs.yesProb !== null && priceBasedProbs.noProb !== null) {
    return {
      yesProbability: Math.round(priceBasedProbs.yesProb * 10) / 10,
      noProbability: Math.round(priceBasedProbs.noProb * 10) / 10,
      loading: false,
      error: null,
    };
  }

  // Fallback to fetching quotes if bid/ask not available
  const yesMint = getMintAddress(market, 'yes');
  const noMint = getMintAddress(market, 'no');

  if (!yesMint || !noMint) {
    return {
      yesProbability: null,
      noProbability: null,
      loading: false,
      error: 'Mint addresses not available',
    };
  }

  try {
    // Use a small amount (0.01 USDC) to get quotes
    const quoteAmount = '10000'; // 0.01 USDC in smallest units (6 decimals)

    // Fetch quotes for both YES and NO tokens
    const [yesQuote, noQuote] = await Promise.allSettled([
      requestOrder({
        userPublicKey: dummyPublicKey,
        inputMint: USDC_MINT,
        outputMint: yesMint,
        amount: quoteAmount,
        slippageBps: 100,
      }),
      requestOrder({
        userPublicKey: dummyPublicKey,
        inputMint: USDC_MINT,
        outputMint: noMint,
        amount: quoteAmount,
        slippageBps: 100,
      }),
    ]);

    let yesProbability: number | null = null;
    let noProbability: number | null = null;

    // Calculate YES probability from quote
    // In prediction markets, the price per token represents the probability
    // If you spend 0.01 USDC and get X tokens, price per token = 0.01 / X
    // This price IS the probability (since tokens pay out 1 USDC if outcome happens)
    if (yesQuote.status === 'fulfilled') {
      const yesOrder = yesQuote.value;
      const yesTokensReceived = parseFloat(yesOrder.outAmount);
      const usdcSpent = parseFloat(yesOrder.inAmount);
      if (yesTokensReceived > 0) {
        // Price per YES token = USDC spent / YES tokens received
        // This represents the probability that YES will happen
        const pricePerToken = usdcSpent / yesTokensReceived;
        yesProbability = pricePerToken * 100; // Convert to percentage
      }
    }

    // Calculate NO probability from quote
    if (noQuote.status === 'fulfilled') {
      const noOrder = noQuote.value;
      const noTokensReceived = parseFloat(noOrder.outAmount);
      const usdcSpent = parseFloat(noOrder.inAmount);
      if (noTokensReceived > 0) {
        const pricePerToken = usdcSpent / noTokensReceived;
        noProbability = pricePerToken * 100; // Convert to percentage
      }
    }

    // Normalize probabilities to sum to 100% (in case of slight discrepancies)
    if (yesProbability !== null && noProbability !== null) {
      const total = yesProbability + noProbability;
      if (total > 0) {
        yesProbability = (yesProbability / total) * 100;
        noProbability = (noProbability / total) * 100;
      }
    } else if (yesProbability !== null && yesProbability <= 100) {
      // If only YES quote succeeded, assume NO is complement
      noProbability = 100 - yesProbability;
    } else if (noProbability !== null && noProbability <= 100) {
      // If only NO quote succeeded, assume YES is complement
      yesProbability = 100 - noProbability;
    }

    return {
      yesProbability: yesProbability !== null ? Math.round(yesProbability * 10) / 10 : null,
      noProbability: noProbability !== null ? Math.round(noProbability * 10) / 10 : null,
      loading: false,
      error: null,
    };
  } catch (error: any) {
    console.error('Error fetching market probabilities:', error);
    return {
      yesProbability: null,
      noProbability: null,
      loading: false,
      error: error.message || 'Failed to fetch probabilities',
    };
  }
}

