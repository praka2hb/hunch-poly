import 'server-only';
import redis, { CacheKeys, CacheTTL } from '@/app/lib/redis';

// ============ CONFIGURATION ============

const GAMMA_BASE_URL =
  process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

// ============ TYPES ============

/** Token (YES/NO outcome) within a Polymarket market */
export interface PolyToken {
  token_id: string;
  outcome: string; // "Yes" or "No"
  price: number;   // 0.0 - 1.0
  winner?: boolean;
}

/** A single Polymarket market (binary outcome) */
export interface PolyMarket {
  id: string;
  condition_id: string;
  question: string;
  question_id?: string;
  slug: string;
  description?: string;
  market_slug?: string;
  end_date_iso?: string;
  game_start_time?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  accepting_orders: boolean;
  accepting_order_timestamp?: string;
  minimum_order_size?: number;
  minimum_tick_size?: number;
  volume: number;
  volume_num?: number;
  liquidity?: number;
  open_interest?: number;
  creation_date?: string;
  tokens: PolyToken[];
  outcome_prices?: string; // JSON string like "[\"0.65\",\"0.35\"]"
  outcome?: string;        // "Yes" or "No" — resolved outcome
  image?: string;
  icon?: string;
  rewards?: {
    rates: { asset_address: string; rewards_daily_rate: number }[];
    min_size: number;
    max_spread: number;
  };
  tags?: { id: string; slug: string; label: string }[];
  // Price fields for display
  best_bid?: number;
  best_ask?: number;
  last_trade_price?: number;
  // Extra fields from Gamma
  [key: string]: any;
}

/** A Polymarket event (groups one or more binary markets) */
export interface PolyEvent {
  id: string;
  slug: string;
  title: string;
  description?: string;
  category?: string;
  sub_category?: string;
  start_date?: string;
  end_date?: string;
  creation_date?: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  volume: number;
  volume_num?: number;
  liquidity?: number;
  open_interest?: number;
  markets: PolyMarket[];
  image?: string;
  icon?: string;
  banner?: string;
  tags?: { id: string; slug: string; label: string }[];
  competitive?: boolean;
  comment_count?: number;
  [key: string]: any;
}

/** A price history point */
export interface PricePoint {
  t: number; // Unix timestamp
  p: number; // Price (0.0 - 1.0)
}

// ============ HELPER FUNCTIONS ============

/**
 * Make a GET request to the Gamma API.
 * Gamma API is read-only and requires no authentication.
 */
async function gammaFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>
): Promise<T> {
  const url = new URL(path, GAMMA_BASE_URL);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const fullUrl = url.toString();
  console.log(`[polymarketGamma] Fetching: ${fullUrl}`);

  let response: Response;
  try {
    response = await fetch(fullUrl, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15000), // 15 second timeout
    });
  } catch (fetchError: any) {
    const errorMessage = fetchError?.message || 'Unknown fetch error';
    const errorName = fetchError?.name || 'FetchError';

    console.error(`[polymarketGamma] Network error:`, {
      error: errorMessage,
      name: errorName,
      url: fullUrl,
    });

    if (errorName === 'AbortError' || errorMessage.includes('timeout')) {
      throw new Error(`Polymarket Gamma API request timed out: ${path}`);
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
      throw new Error(`Cannot connect to Polymarket Gamma API at ${GAMMA_BASE_URL}`);
    } else {
      throw new Error(`Network error fetching from Polymarket Gamma API: ${errorMessage}`);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[polymarketGamma] API Error (${response.status}):`, errorText);
    throw new Error(`Polymarket Gamma API error: ${response.status} ${response.statusText}`);
  }

  return await response.json();
}

// ============ API FUNCTIONS ============

/**
 * Fetch events from Gamma API with pagination and filtering.
 * GET /events
 */
export async function fetchGammaEvents(options?: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  slug?: string;
  tag_slug?: string;  // e.g. "politics", "crypto", "sports"
  order?: string;       // e.g. "volume", "liquidity", "start_date"
  ascending?: boolean;
}): Promise<PolyEvent[]> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const cacheKey = CacheKeys.polyEvents(
    `${limit}:${offset}:${options?.active ?? ''}:${options?.closed ?? ''}:${options?.slug ?? ''}:${options?.tag_slug ?? ''}:${options?.order ?? ''}`
  );

  // Check Redis cache
  try {
    const cached = await redis.get<PolyEvent[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for events`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for events:`, err);
  }

  const events = await gammaFetch<PolyEvent[]>('/events', {
    limit,
    offset,
    active: options?.active,
    closed: options?.closed,
    slug: options?.slug,
    tag_slug: options?.tag_slug,
    order: options?.order,
    ascending: options?.ascending,
  });

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_EVENTS, JSON.stringify(events));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache events:`, err);
  }

  return events;
}


/**
 * Fetch a single event by slug from Gamma API.
 * GET /events/{slug}
 */
export async function fetchGammaEvent(slug: string): Promise<PolyEvent> {
  const cacheKey = CacheKeys.polyEvent(slug);

  // Check Redis cache
  try {
    const cached = await redis.get<PolyEvent>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for event ${slug}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for event ${slug}:`, err);
  }

  const event = await gammaFetch<PolyEvent>(`/events/${encodeURIComponent(slug)}`);

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKET, JSON.stringify(event));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache event ${slug}:`, err);
  }

  return event;
}

/**
 * Fetch markets from Gamma API with pagination and filtering.
 * GET /markets
 */
export async function fetchGammaMarkets(options?: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  condition_id?: string;
  slug?: string;
  order?: string;
  ascending?: boolean;
}): Promise<PolyMarket[]> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;

  const cacheKey = CacheKeys.polyMarkets(
    `${limit}:${offset}:${options?.active ?? ''}:${options?.condition_id ?? ''}:${options?.slug ?? ''}`
  );

  // Check Redis cache
  try {
    const cached = await redis.get<PolyMarket[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for markets`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for markets:`, err);
  }

  const markets = await gammaFetch<PolyMarket[]>('/markets', {
    limit,
    offset,
    active: options?.active,
    closed: options?.closed,
    condition_id: options?.condition_id,
    slug: options?.slug,
    order: options?.order,
    ascending: options?.ascending,
  });

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKET, JSON.stringify(markets));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache markets:`, err);
  }

  return markets;
}

/**
 * Fetch a single market by condition ID from Gamma API.
 * GET /markets/{condition_id}
 */
export async function fetchGammaMarket(conditionId: string): Promise<PolyMarket> {
  const cacheKey = CacheKeys.polyMarket(conditionId);

  // Check Redis cache
  try {
    const cached = await redis.get<PolyMarket>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for market ${conditionId}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for market ${conditionId}:`, err);
  }

  const market = await gammaFetch<PolyMarket>(`/markets/${encodeURIComponent(conditionId)}`);

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKET, JSON.stringify(market));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache market ${conditionId}:`, err);
  }

  return market;
}

/**
 * Fetch price history for a market.
 * Gamma API: GET /prices-history with market param
 * Note: The Gamma API uses the CLOB token_id for prices history, not condition_id.
 * We accept conditionId and fetch the market first to get the token_id, or accept a tokenId directly.
 */
export async function fetchGammaPriceHistory(options: {
  tokenId?: string;
  conditionId?: string;
  startTs?: number;
  endTs?: number;
  interval?: string; // "max", "1d", "1w", "1m" etc.
  fidelity?: number; // number of data points
}): Promise<PricePoint[]> {
  // Need a tokenId — either provided directly or fetched via conditionId
  let tokenId = options.tokenId;

  if (!tokenId && options.conditionId) {
    // Fetch market to get the YES token ID
    const market = await fetchGammaMarket(options.conditionId);
    const yesToken = market.tokens?.find(t => t.outcome === 'Yes');
    tokenId = yesToken?.token_id;
  }

  if (!tokenId) {
    throw new Error('Either tokenId or conditionId is required for price history');
  }

  const cacheKey = CacheKeys.polyPriceHistory(
    tokenId,
    `${options.startTs ?? ''}:${options.endTs ?? ''}:${options.interval ?? ''}:${options.fidelity ?? ''}`
  );

  // Check Redis cache
  try {
    const cached = await redis.get<PricePoint[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for price history ${tokenId}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for price history:`, err);
  }

  const rawHistory = await gammaFetch<{ history: PricePoint[] } | PricePoint[]>(
    '/prices-history',
    {
      market: tokenId,
      startTs: options.startTs,
      endTs: options.endTs,
      interval: options.interval,
      fidelity: options.fidelity,
    }
  );

  // Normalize response shape
  const history = Array.isArray(rawHistory)
    ? rawHistory
    : (rawHistory as any)?.history ?? [];

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_PRICES, JSON.stringify(history));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache price history:`, err);
  }

  return history;
}

/**
 * Search markets by text query.
 * Uses Gamma API /markets with text_query param.
 */
export async function searchGammaMarkets(
  query: string,
  options?: { limit?: number; active?: boolean }
): Promise<PolyMarket[]> {
  return gammaFetch<PolyMarket[]>('/markets', {
    limit: options?.limit ?? 20,
    active: options?.active ?? true,
    slug: query, // Gamma uses slug for text-based search
  });
}

/**
 * Fetch tags from Gamma API.
 * GET /tags
 */
export async function fetchGammaTags(): Promise<{ id: string; slug: string; label: string }[]> {
  const cacheKey = 'poly:tags';

  try {
    const cached = await redis.get<{ id: string; slug: string; label: string }[]>(cacheKey);
    if (cached) return cached;
  } catch { /* cache miss */ }

  const tags = await gammaFetch<{ id: string; slug: string; label: string }[]>('/tags');

  try {
    await redis.setex(cacheKey, 3600, JSON.stringify(tags)); // 1 hour cache
  } catch { /* fire-and-forget */ }

  return tags;
}
