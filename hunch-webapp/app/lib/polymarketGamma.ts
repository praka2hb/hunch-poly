import 'server-only';
import redis, { CacheKeys, CacheTTL } from '@/app/lib/redis';

// ============ CONFIGURATION ============

const GAMMA_BASE_URL =
  process.env.POLYMARKET_GAMMA_URL || 'https://gamma-api.polymarket.com';

// ============ TYPES ============

/** Derived fields we add to every market object */
export interface MarketDerived {
  tokenIds: string[];
  yesTokenId: string | null;
  noTokenId: string | null;
  prices: number[];
  outcomeLabels: string[];
  bestBidPct: number | null;
  bestAskPct: number | null;
  lastTradePricePct: number | null;
}

/** Raw Gamma Market object (camelCase as returned by Gamma API) */
export interface GammaMarket {
  id: string;
  conditionId: string;
  question: string | null;
  slug: string | null;
  description: string | null;
  image: string | null;
  icon: string | null;
  active: boolean | null;
  closed: boolean | null;
  archived: boolean | null;
  acceptingOrders: boolean | null;
  enableOrderBook: boolean | null;
  outcomes: string | null;        // JSON string e.g. '["Yes","No"]'
  outcomePrices: string | null;   // JSON string e.g. '["0.65","0.35"]'
  clobTokenIds: string | null;    // JSON string e.g. '["123","456"]'
  volume: string | null;
  volumeNum: number | null;
  liquidityNum: number | null;
  volume24hr: number | null;
  volume1wk: number | null;
  volume1mo: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  lastTradePrice: number | null;
  oneDayPriceChange: number | null;
  oneWeekPriceChange: number | null;
  endDate: string | null;
  startDate: string | null;
  tags: any[];
  categories: any[];
  [key: string]: any;
}

/** Transformed market = raw Gamma fields + derived fields */
export type TransformedMarket = GammaMarket & MarketDerived;

/** Raw Gamma Event object */
export interface GammaEvent {
  id: string;
  slug: string | null;
  title: string | null;
  description: string | null;
  category: string | null;
  subcategory: string | null;
  startDate: string | null;
  endDate: string | null;
  active: boolean | null;
  closed: boolean | null;
  archived: boolean | null;
  volume: number | null;
  volume24hr: number | null;
  volume1wk: number | null;
  liquidity: number | null;
  openInterest: number | null;
  image: string | null;
  icon: string | null;
  featured: boolean | null;
  negRisk: boolean | null;
  markets: GammaMarket[];
  tags: any[];
  categories: any[];
  commentCount: number | null;
  [key: string]: any;
}

/** Transformed event = raw fields with transformed nested markets */
export interface TransformedEvent extends Omit<GammaEvent, 'markets'> {
  markets: TransformedMarket[];
}

/** A price history point */
export interface PricePoint {
  t: number; // Unix timestamp
  p: number; // Price (0.0 - 1.0)
}

/** Gamma Tag */
export interface GammaTag {
  id: string;
  label: string | null;
  slug: string | null;
  forceShow: boolean | null;
  forceHide: boolean | null;
}

// ============ MARKET TRANSFORM ============

/**
 * Apply derived fields to a raw Gamma market object.
 * Parses JSON string fields and adds percentage display values.
 * Original fields are preserved.
 */
export function transformMarket(market: GammaMarket): TransformedMarket {
  let tokenIds: string[] = [];
  try {
    if (market.clobTokenIds) tokenIds = JSON.parse(market.clobTokenIds);
  } catch { /* malformed JSON */ }

  let prices: number[] = [];
  try {
    if (market.outcomePrices) prices = JSON.parse(market.outcomePrices).map(Number);
  } catch { /* malformed JSON */ }

  let outcomeLabels: string[] = [];
  try {
    if (market.outcomes) outcomeLabels = JSON.parse(market.outcomes);
  } catch { /* malformed JSON */ }

  return {
    ...market,
    tokenIds,
    yesTokenId: tokenIds[0] ?? null,
    noTokenId: tokenIds[1] ?? null,
    prices,
    outcomeLabels,
    bestBidPct: market.bestBid != null ? market.bestBid * 100 : null,
    bestAskPct: market.bestAsk != null ? market.bestAsk * 100 : null,
    lastTradePricePct: market.lastTradePrice != null ? market.lastTradePrice * 100 : null,
  };
}

/**
 * Transform all nested markets inside an event.
 */
export function transformEvent(event: GammaEvent): TransformedEvent {
  return {
    ...event,
    markets: Array.isArray(event.markets)
      ? event.markets.map(transformMarket)
      : [],
  };
}

// ============ HELPER FUNCTIONS ============

/**
 * Make a GET request to the Gamma API.
 * Gamma API is read-only and requires no authentication.
 * Uses Next.js fetch with `next.revalidate` for ISR caching.
 */
async function gammaFetch<T>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
  revalidate?: number
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
      next: revalidate != null ? { revalidate } : undefined,
      signal: AbortSignal.timeout(15000),
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
 * Fetch events from Gamma API with filtering.
 * GET /events
 */
export async function fetchGammaEvents(options?: {
  limit?: number;
  offset?: number;
  active?: boolean;
  closed?: boolean;
  featured?: boolean;
  slug?: string;
  tag_slug?: string;
  order?: string;
  ascending?: boolean;
  volume_min?: number;
  liquidity_min?: number;
}): Promise<TransformedEvent[]> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const active = options?.active ?? true;
  const closed = options?.closed ?? false;
  const order = options?.order ?? 'volume24hr';
  const ascending = options?.ascending ?? false;

  const cacheKey = CacheKeys.polyEvents(
    `${limit}:${offset}:${active}:${closed}:${options?.featured ?? ''}:${options?.slug ?? ''}:${options?.tag_slug ?? ''}:${order}:${ascending}`
  );

  // Check Redis cache
  try {
    const cached = await redis.get<TransformedEvent[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for events`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for events:`, err);
  }

  const rawEvents = await gammaFetch<GammaEvent[]>('/events', {
    limit,
    offset,
    active,
    closed,
    featured: options?.featured,
    slug: options?.slug,
    tag_slug: options?.tag_slug,
    order,
    ascending,
    volume_min: options?.volume_min,
    liquidity_min: options?.liquidity_min,
  }, CacheTTL.POLY_EVENTS);

  const events = (Array.isArray(rawEvents) ? rawEvents : []).map(transformEvent);

  // Cache the result
  try {
    await redis.setex(cacheKey, CacheTTL.POLY_EVENTS, JSON.stringify(events));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache events:`, err);
  }

  return events;
}

/**
 * Fetch featured events.
 * GET /events?featured=true&active=true&closed=false&order=volume24hr&ascending=false&limit=10
 */
export async function fetchGammaFeaturedEvents(): Promise<TransformedEvent[]> {
  const cacheKey = CacheKeys.polyEventsFeatured();

  try {
    const cached = await redis.get<TransformedEvent[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for featured events`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for featured events:`, err);
  }

  const rawEvents = await gammaFetch<GammaEvent[]>('/events', {
    featured: true,
    active: true,
    closed: false,
    order: 'volume24hr',
    ascending: false,
    limit: 10,
  }, CacheTTL.POLY_EVENTS_FEATURED);

  const events = (Array.isArray(rawEvents) ? rawEvents : []).map(transformEvent);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_EVENTS_FEATURED, JSON.stringify(events));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache featured events:`, err);
  }

  return events;
}

/**
 * Fetch a single event by slug from Gamma API.
 * GET /events?slug={slug}
 */
export async function fetchGammaEvent(slug: string): Promise<TransformedEvent> {
  const cacheKey = CacheKeys.polyEvent(slug);

  try {
    const cached = await redis.get<TransformedEvent>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for event ${slug}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for event ${slug}:`, err);
  }

  const rawEvents = await gammaFetch<GammaEvent[]>('/events', { slug }, CacheTTL.POLY_EVENTS);

  if (!Array.isArray(rawEvents) || rawEvents.length === 0) {
    throw new Error(`Event not found: ${slug}`);
  }

  const event = transformEvent(rawEvents[0]);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_EVENTS, JSON.stringify(event));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache event ${slug}:`, err);
  }

  return event;
}

/**
 * Fetch markets from Gamma API with filtering.
 * GET /markets
 */
export async function fetchGammaMarkets(options?: {
  limit?: number;
  offset?: number;
  order?: string;
  ascending?: boolean;
  active?: boolean;
  tag_id?: number;
  closed?: boolean;
  condition_ids?: string;
}): Promise<TransformedMarket[]> {
  const limit = options?.limit ?? 20;
  const offset = options?.offset ?? 0;
  const order = options?.order ?? 'volume24hr';
  const ascending = options?.ascending ?? false;
  const active = options?.active ?? true;
  const closed = options?.closed ?? false;

  const cacheKey = CacheKeys.polyMarkets(
    `${limit}:${offset}:${order}:${ascending}:${active}:${closed}:${options?.tag_id ?? ''}:${options?.condition_ids ?? ''}`
  );

  try {
    const cached = await redis.get<TransformedMarket[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for markets`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for markets:`, err);
  }

  const rawMarkets = await gammaFetch<GammaMarket[]>('/markets', {
    limit,
    offset,
    order,
    ascending,
    active,
    closed,
    tag_id: options?.tag_id,
    condition_ids: options?.condition_ids,
  }, CacheTTL.POLY_MARKET);

  const markets = (Array.isArray(rawMarkets) ? rawMarkets : []).map(transformMarket);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKET, JSON.stringify(markets));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache markets:`, err);
  }

  return markets;
}

/**
 * Fetch top markets by 24hr volume.
 * GET /markets?order=volume24hr&ascending=false&active=true&closed=false&limit=20
 */
export async function fetchGammaTopMarkets(): Promise<TransformedMarket[]> {
  const cacheKey = CacheKeys.polyMarketsTop();

  try {
    const cached = await redis.get<TransformedMarket[]>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for top markets`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for top markets:`, err);
  }

  const rawMarkets = await gammaFetch<GammaMarket[]>('/markets', {
    order: 'volume24hr',
    ascending: false,
    active: true,
    closed: false,
    limit: 20,
  }, CacheTTL.POLY_MARKETS_TOP);

  const markets = (Array.isArray(rawMarkets) ? rawMarkets : []).map(transformMarket);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKETS_TOP, JSON.stringify(markets));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache top markets:`, err);
  }

  return markets;
}

/**
 * Fetch a single market by condition ID from Gamma API.
 * GET /markets?condition_ids={conditionId}
 */
export async function fetchGammaMarket(conditionId: string): Promise<TransformedMarket> {
  const cacheKey = CacheKeys.polyMarket(conditionId);

  try {
    const cached = await redis.get<TransformedMarket>(cacheKey);
    if (cached) {
      console.log(`[polymarketGamma] Cache HIT for market ${conditionId}`);
      return cached;
    }
  } catch (err) {
    console.warn(`[polymarketGamma] Redis cache error for market ${conditionId}:`, err);
  }

  const rawMarkets = await gammaFetch<GammaMarket[]>('/markets', {
    condition_ids: conditionId,
  }, CacheTTL.POLY_MARKET);

  if (!Array.isArray(rawMarkets) || rawMarkets.length === 0) {
    throw new Error(`Market not found: ${conditionId}`);
  }

  const market = transformMarket(rawMarkets[0]);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_MARKET, JSON.stringify(market));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache market ${conditionId}:`, err);
  }

  return market;
}

/**
 * Fetch price history for a market.
 * Gamma API: GET /prices-history with market param.
 * Uses the CLOB token_id for prices history.
 */
export async function fetchGammaPriceHistory(options: {
  tokenId?: string;
  conditionId?: string;
  startTs?: number;
  endTs?: number;
  interval?: string;
  fidelity?: number;
}): Promise<PricePoint[]> {
  let tokenId = options.tokenId;

  if (!tokenId && options.conditionId) {
    const market = await fetchGammaMarket(options.conditionId);
    tokenId = market.yesTokenId ?? undefined;
  }

  if (!tokenId) {
    throw new Error('Either tokenId or conditionId is required for price history');
  }

  const cacheKey = CacheKeys.polyPriceHistory(
    tokenId,
    `${options.startTs ?? ''}:${options.endTs ?? ''}:${options.interval ?? ''}:${options.fidelity ?? ''}`
  );

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
    },
    0 // never cache orderbook/price data via Next.js revalidate
  );

  const history = Array.isArray(rawHistory)
    ? rawHistory
    : (rawHistory as any)?.history ?? [];

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_PRICES, JSON.stringify(history));
  } catch (err) {
    console.warn(`[polymarketGamma] Failed to cache price history:`, err);
  }

  return history;
}

/**
 * Fetch tags from Gamma API.
 * GET /tags
 */
export async function fetchGammaTags(): Promise<GammaTag[]> {
  const cacheKey = CacheKeys.polyTags();

  try {
    const cached = await redis.get<GammaTag[]>(cacheKey);
    if (cached) return cached;
  } catch { /* cache miss */ }

  const tags = await gammaFetch<GammaTag[]>('/tags', undefined, CacheTTL.POLY_TAGS);

  try {
    await redis.setex(cacheKey, CacheTTL.POLY_TAGS, JSON.stringify(tags));
  } catch { /* fire-and-forget */ }

  return tags;
}

/**
 * Search markets by text query.
 * Uses Gamma API /markets with slug param.
 */
export async function searchGammaMarkets(
  query: string,
  options?: { limit?: number; active?: boolean }
): Promise<TransformedMarket[]> {
  const rawMarkets = await gammaFetch<GammaMarket[]>('/markets', {
    limit: options?.limit ?? 20,
    active: options?.active ?? true,
    slug: query,
  }, CacheTTL.POLY_MARKET);

  return (Array.isArray(rawMarkets) ? rawMarkets : []).map(transformMarket);
}
