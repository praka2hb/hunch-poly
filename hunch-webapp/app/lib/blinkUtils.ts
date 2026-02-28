/**
 * Utility functions for creating Solana Actions blinks
 */

/**
 * Create a blink URL for a prediction market
 * @param marketTicker - The market ticker (e.g., "KXBTCMAX150-25-26APR30-149999.99")
 * @param baseUrl - The base URL of your application (defaults to current origin)
 * @returns A blink URL that can be shared
 */
export function createMarketBlinkUrl(
  marketTicker: string,
  baseUrl?: string
): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const actionUrl = `${origin}/api/actions/market/${encodeURIComponent(marketTicker)}`;
  const blinkUrl = `${origin}/market/${encodeURIComponent(marketTicker)}`;
  
  // Return the blink URL (the actions.json will map this to the action API)
  return blinkUrl;
}

/**
 * Create a solana-action protocol URL for a market
 * This is the direct Action URL format
 * @param marketTicker - The market ticker
 * @param baseUrl - The base URL of your application
 * @returns A solana-action protocol URL
 */
export function createSolanaActionUrl(
  marketTicker: string,
  baseUrl?: string
): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const actionUrl = `${origin}/api/actions/market/${encodeURIComponent(marketTicker)}`;
  return `solana-action:${actionUrl}`;
}

/**
 * Create a blink URL with action parameter (for interstitial sites)
 * @param marketTicker - The market ticker
 * @param blinkClientUrl - The blink client URL (e.g., "https://dial.to")
 * @param baseUrl - The base URL of your application
 * @returns A blink URL with action parameter
 */
export function createBlinkUrlWithAction(
  marketTicker: string,
  blinkClientUrl: string = 'https://dial.to',
  baseUrl?: string
): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const actionUrl = `${origin}/api/actions/market/${encodeURIComponent(marketTicker)}`;
  const solanaActionUrl = `solana-action:${actionUrl}`;
  const encodedAction = encodeURIComponent(solanaActionUrl);
  return `${blinkClientUrl}/?action=${encodedAction}`;
}

/**
 * Create a dial.to developer link for sharing blinks
 * @param marketTicker - The market ticker
 * @param cluster - The Solana cluster (defaults to "mainnet")
 * @param baseUrl - The base URL of your application
 * @returns A dial.to developer link that can be shared
 */
export function createDialToDeveloperLink(
  marketTicker: string,
  cluster: string = 'mainnet',
  baseUrl?: string
): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? window.location.origin : '');
  const actionUrl = `${origin}/api/actions/market/${encodeURIComponent(marketTicker)}`;
  const solanaActionUrl = `solana-action:${actionUrl}`;
  const blinkUrl = `https://dial.to/?action=${encodeURIComponent(solanaActionUrl)}`;
  const encodedBlinkUrl = encodeURIComponent(blinkUrl);
  return `https://dial.to/developer?url=${encodedBlinkUrl}&cluster=${cluster}`;
}

