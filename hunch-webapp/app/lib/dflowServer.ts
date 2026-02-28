import 'server-only';
import { Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import redis, { CacheKeys, CacheTTL } from '@/app/lib/redis';

// Server-only DFlow API library
// These URLs are never exposed in the client bundle

// Production API endpoints
const METADATA_API_BASE_URL =
    process.env.DFLOW_METADATA_API_URL ??
    process.env.NEXT_PUBLIC_PM_METADATA_API_BASE_URL ??
    "https://a.prediction-markets-api.dflow.net";

const TRADE_API_BASE_URL =
    process.env.DFLOW_TRADE_API_URL ??
    process.env.NEXT_PUBLIC_PM_TRADE_API_BASE_URL ??
    "https://b.quote-api.dflow.net";

// API Key for authentication (required for production endpoints)
const DFLOW_API_KEY = process.env.NEXT_PUBLIC_DFLOW_API_KEY ?? process.env.DFLOW_API_KEY;

// Helper to get common headers with API key
function getHeaders(): HeadersInit {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
    };

    if (DFLOW_API_KEY) {
        headers["x-api-key"] = DFLOW_API_KEY;
    } else {
        console.warn('[dflowServer] No API key found. Set NEXT_PUBLIC_DFLOW_API_KEY or DFLOW_API_KEY in .env');
    }

    return headers;
}

// ============ TYPES ============

export interface Market {
    ticker: string;
    title: string;
    status: string;
    yesMint?: string;
    noMint?: string;
    volume?: number;
    eventTicker?: string;
    marketType?: string;
    subtitle?: string;
    yesSubTitle?: string;
    noSubTitle?: string;
    openTime?: number;
    closeTime?: number;
    expirationTime?: number;
    result?: string;
    openInterest?: number;
    canCloseEarly?: boolean;
    earlyCloseCondition?: string;
    rulesPrimary?: string;
    rulesSecondary?: string;
    yesBid?: string;
    yesAsk?: string;
    noBid?: string;
    noAsk?: string;
    accounts?: Record<string, any>;
    [key: string]: any;
}

export interface MarketsResponse {
    markets: Market[];
    [key: string]: any;
}

export interface Event {
    ticker: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    volume?: number;
    volume24h?: number;
    liquidity?: number;
    openInterest?: number;
    closeTime?: number | string;
    markets?: Market[];
    [key: string]: any;
}

export interface EventsResponse {
    events: Event[];
    cursor?: string;
    [key: string]: any;
}

export interface Series {
    ticker: string;
    title: string;
    category?: string;
    tags?: string[];
    frequency?: string;
    [key: string]: any;
}

export interface SeriesResponse {
    series: Series[];
    [key: string]: any;
}

export interface EventDetails {
    ticker: string;
    title: string;
    subtitle?: string;
    imageUrl?: string;
    markets?: Market[];
    [key: string]: any;
}

export interface EventMetadataMarketDetail {
    color_code?: string;
    image_url?: string;
    market_ticker?: string;
}

export interface EventMetadataResponse {
    featured_image_url?: string;
    image_url?: string;
    market_details?: EventMetadataMarketDetail[];
    settlement_sources?: { name?: string; url?: string }[];
    [key: string]: any;
}

export interface CandlestickData {
    end_period_ts: number;
    open_interest: number;
    volume: number;
    price: {
        close: number | null;
        close_dollars: string;
        high: number | null;
        high_dollars: string;
        low: number | null;
        low_dollars: string;
        open: number | null;
        open_dollars: string;
        mean: number | null;
        mean_dollars: string;
        previous: number | null;
        previous_dollars: string;
    };
    yes_ask: Record<string, any>;
    yes_bid: Record<string, any>;
}

export interface CandlesticksByMintResponse {
    candlesticks: CandlestickData[];
    ticker: string;
}

export interface EventCandlesticksResponse {
    adjusted_end_ts: number;
    market_candlesticks: CandlestickData[][];
    market_tickers: string[];
}

// Platform fee configuration
// Set ENABLE_PLATFORM_FEES=true in .env to enable platform fees
const ENABLE_PLATFORM_FEES = process.env.ENABLE_PLATFORM_FEES === 'true';
const PLATFORM_FEE_SCALE = '50'; // 50 bps (0.5%)
const PLATFORM_FEE_ACCOUNT = 'CjH6XsvFD6poErKvN8fj7hxEUKj2t2xeP5xHRo9Lzys2';

// Sponsor configuration
const SPONSOR_PUBLIC_KEY = '7kTQprvYD4QFsAbDZJkeb7tbCJW3KdKhRMX2Q4gUiRj1';
const SPONSOR_PRIVATE_KEY_BASE58 = process.env.SPONSOR_PRIVATE_KEY_BASE58;
let sponsorKeypairWarningLogged = false;

const sponsorKeypair = (() => {
    if (!SPONSOR_PRIVATE_KEY_BASE58) {
        return null;
    }

    try {
        const secretKey = bs58.decode(SPONSOR_PRIVATE_KEY_BASE58);
        return Keypair.fromSecretKey(secretKey);
    } catch (error) {
        if (!sponsorKeypairWarningLogged) {
            console.warn('[dflowServer] Invalid sponsor private key format.');
            sponsorKeypairWarningLogged = true;
        }
        return null;
    }
})();

function signWithSponsor(transactionBase64: string): string {
    if (!sponsorKeypair) {
        if (!sponsorKeypairWarningLogged) {
            console.warn('[dflowServer] Sponsor signing skipped: missing private key.');
            sponsorKeypairWarningLogged = true;
        }
        return transactionBase64;
    }

    try {
        const transactionBytes = Buffer.from(transactionBase64, 'base64');
        const transaction = VersionedTransaction.deserialize(transactionBytes);
        transaction.sign([sponsorKeypair]);
        return Buffer.from(transaction.serialize()).toString('base64');
    } catch (error) {
        console.warn('[dflowServer] Sponsor signing failed.');
        return transactionBase64;
    }
}

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
    transaction?: string;
    openTransaction?: string;
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

// ============ API FUNCTIONS ============

/**
 * Fetch events from DFlow API (server-only)
 */
export async function fetchEventsServer(
    limit: number = 100,
    options?: {
        status?: string;
        withNestedMarkets?: boolean;
        cursor?: string;
    }
): Promise<EventsResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append("limit", limit.toString());

    if (options?.status) {
        queryParams.append("status", options.status);
    }
    if (options?.withNestedMarkets) {
        queryParams.append("withNestedMarkets", "true");
    }
    if (options?.cursor) {
        queryParams.append("cursor", options.cursor);
    }

    const cacheKey = CacheKeys.events(queryParams.toString());

    // 1. Check Redis cache for the entire events list
    try {
        const cached = await redis.get<EventsResponse>(cacheKey);
        if (cached) {
            console.log(`[dflowServer] Returning cached events for ${queryParams.toString()}`);
            return cached;
        }
    } catch (err) {
        console.warn(`[dflowServer] Redis cache error for events list ${queryParams.toString()}:`, err);
    }

    const url = `${METADATA_API_BASE_URL}/api/v1/events?${queryParams.toString()}`;
    console.log(`[dflowServer] Fetching events from: ${url}`);

    let response;
    try {
        response = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
            cache: 'no-store',
            // Add timeout to prevent hanging
            signal: AbortSignal.timeout(30000), // 30 second timeout
        });
    } catch (fetchError: any) {
        const errorMessage = fetchError?.message || 'Unknown fetch error';
        const errorName = fetchError?.name || 'FetchError';
        console.error(`[dflowServer] Network error fetching events:`, {
            error: errorMessage,
            name: errorName,
            url,
            hasApiKey: !!DFLOW_API_KEY,
            apiBaseUrl: METADATA_API_BASE_URL,
        });

        // Provide more helpful error messages
        if (errorName === 'AbortError' || errorMessage.includes('timeout')) {
            throw new Error(`DFlow API request timed out. The API at ${METADATA_API_BASE_URL} may be slow or unreachable.`);
        } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            throw new Error(`Cannot connect to DFlow API at ${METADATA_API_BASE_URL}. Check your network connection and API endpoint.`);
        } else {
            throw new Error(`Network error fetching events from DFlow API: ${errorMessage}. URL: ${url}`);
        }
    }

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[dflowServer] Events API Error (${response.status}):`, errorText);
        console.error(`[dflowServer] Request URL: ${url}`);
        console.error(`[dflowServer] Query params:`, queryParams.toString());
        throw new Error(`Failed to fetch events: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const data: EventsResponse = await response.json();
    const events = await enrichEventsWithMetadata(data.events || []);

    const result = { ...data, events };

    // 2. Store in Redis
    try {
        await redis.setex(cacheKey, CacheTTL.EVENTS_LIST, JSON.stringify(result));
    } catch (err) {
        console.warn(`[dflowServer] Failed to cache events list for ${queryParams.toString()}:`, err);
    }

    return result;
}

/**
 * Fetch event details from DFlow API (server-only)
 */
export async function fetchEventDetailsServer(eventTicker: string): Promise<EventDetails> {
    const url = `${METADATA_API_BASE_URL}/api/v1/event/${encodeURIComponent(eventTicker)}?withNestedMarkets=true`;
    console.log(`[dflowServer] Fetching event details for: ${eventTicker}`);

    let response;
    try {
        response = await fetch(url, {
            method: "GET",
            headers: getHeaders(),
            cache: 'no-store',
            // Add timeout to prevent hanging
            signal: AbortSignal.timeout(30000), // 30 second timeout
        });
    } catch (fetchError: any) {
        const errorMessage = fetchError?.message || 'Unknown fetch error';
        const errorName = fetchError?.name || 'FetchError';
        console.error(`[dflowServer] Network error fetching event details:`, {
            error: errorMessage,
            name: errorName,
            ticker: eventTicker,
            url,
            hasApiKey: !!DFLOW_API_KEY,
            apiBaseUrl: METADATA_API_BASE_URL,
        });

        // Provide more helpful error messages
        if (errorName === 'AbortError' || errorMessage.includes('timeout')) {
            throw new Error(`DFlow API request timed out for event ${eventTicker}. The API at ${METADATA_API_BASE_URL} may be slow or unreachable.`);
        } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) {
            throw new Error(`Cannot connect to DFlow API at ${METADATA_API_BASE_URL} for event ${eventTicker}. Check your network connection and API endpoint.`);
        } else {
            throw new Error(`Network error fetching event details for ${eventTicker}: ${errorMessage}. URL: ${url}`);
        }
    }

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[dflowServer] Event Details API Error (${response.status}):`, errorText);
        console.error(`[dflowServer] Request URL: ${url}`);
        throw new Error(`Failed to fetch event details: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return await response.json();
}

/**
 * Fetch event metadata from Kalshi (server-only)
 * cached in Redis to prevent rate limits and improve performance
 */
export async function fetchEventMetadataServer(eventTicker: string): Promise<EventMetadataResponse | null> {
    // 1. Check Redis cache
    const cacheKey = CacheKeys.eventMetadata(eventTicker);
    try {
        const cached = await redis.get<EventMetadataResponse>(cacheKey);
        if (cached) {
            return cached;
        }
    } catch (err) {
        console.warn(`[dflowServer] Redis cache error for ${eventTicker}:`, err);
    }

    const url = `https://api.elections.kalshi.com/trade-api/v2/events/${encodeURIComponent(eventTicker)}/metadata`;
    console.log(`[dflowServer] Fetching event metadata for: ${eventTicker}`);

    try {
        const response = await fetch(url, {
            method: "GET",
            // Remove 'no-store' to allow internal fetch mechanism if any, though we use Redis
            signal: AbortSignal.timeout(10000), // Reduced timeout to 10s
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.warn(`[dflowServer] Event metadata API Error (${response.status}) for ${eventTicker}:`, errorText);
            // Cache null result for a shorter time to avoid hammering 404s? 
            // For now, don't cache errors to allow retry
            return null;
        }

        const data = await response.json();

        // 2. Store in Redis
        try {
            await redis.setex(cacheKey, CacheTTL.EVENT_METADATA, JSON.stringify(data));
        } catch (err) {
            console.warn(`[dflowServer] Failed to cache metadata for ${eventTicker}:`, err);
        }

        return data;
    } catch (error: any) {
        const errorMessage = error?.message || 'Unknown fetch error';
        console.warn(`[dflowServer] Event metadata fetch failed for ${eventTicker}:`, errorMessage);
        return null;
    }
}

async function enrichEventsWithMetadata(events: Event[]): Promise<Event[]> {
    if (!events.length) return events;

    // Use Promise.race to add a global timeout for the entire enrichment process
    const ENRICHMENT_TIMEOUT_MS = 15000; // 15 seconds max for all metadata
    const BATCH_SIZE = 10; // Increased from 5 for better throughput

    const enrichWithTimeout = async (): Promise<(EventMetadataResponse | null)[]> => {
        const metadataResults: (EventMetadataResponse | null)[] = [];

        for (let i = 0; i < events.length; i += BATCH_SIZE) {
            const batch = events.slice(i, i + BATCH_SIZE);
            // Use allSettled to prevent one failure from blocking others
            const batchResults = await Promise.allSettled(
                batch.map(event => fetchEventMetadataServer(event.ticker))
            );

            for (const result of batchResults) {
                metadataResults.push(result.status === 'fulfilled' ? result.value : null);
            }
        }

        return metadataResults;
    };

    let metadataResults: (EventMetadataResponse | null)[];

    try {
        metadataResults = await Promise.race([
            enrichWithTimeout(),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('Enrichment timeout')), ENRICHMENT_TIMEOUT_MS)
            )
        ]);
    } catch (err) {
        console.warn('[dflowServer] Metadata enrichment timed out after 15s, returning events without full metadata');
        // Return events with empty metadata on timeout
        metadataResults = events.map(() => null);
    }

    return events.map((event, idx) => {
        const metadata = metadataResults[idx];

        const marketDetails = metadata?.market_details || [];
        const metadataByTicker = new Map(
            marketDetails
                .filter(detail => detail.market_ticker)
                .map(detail => [detail.market_ticker as string, detail])
        );

        const normalizedMarkets = (event.markets ?? []).map(market => {
            const detail = metadataByTicker.get(market.ticker);
            return {
                ...market,
                image_url: detail?.image_url ?? market.image_url ?? market.imageUrl,
                color_code: detail?.color_code ?? (market as any).color_code,
            };
        });

        const imageUrl =
            metadata?.image_url ??
            (event as any)?.image_url ??
            event.imageUrl;

        const featuredImageUrl =
            metadata?.featured_image_url ??
            (event as any)?.featured_image_url;

        return {
            ...event,
            imageUrl,
            image_url: imageUrl,
            featured_image_url: featuredImageUrl,
            settlement_sources:
                metadata?.settlement_sources ??
                (event as any)?.settlement_sources,
            markets: normalizedMarkets,
        };
    });
}

/**
 * Fetch market details from DFlow API (server-only)
 */
export async function fetchMarketDetailsServer(ticker: string): Promise<Market> {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/market/${encodeURIComponent(ticker)}`,
        {
            method: "GET",
            headers: getHeaders(),
            cache: 'no-store',
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[dflowServer] Market Details API Error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch market details: ${response.status} ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Fetch candlesticks by mint address from DFlow API (server-only)
 */
export async function fetchCandlesticksByMintServer(
    mintAddress: string,
    options?: {
        startTs?: number;
        endTs?: number;
        periodInterval?: number;
    }
): Promise<CandlesticksByMintResponse> {
    const queryParams = new URLSearchParams();
    if (options?.startTs) queryParams.append("startTs", options.startTs.toString());
    if (options?.endTs) queryParams.append("endTs", options.endTs.toString());
    if (options?.periodInterval) queryParams.append("periodInterval", options.periodInterval.toString());

    const url = `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${mintAddress}/candlesticks${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
        cache: 'no-store',
    });

    if (!response.ok) {
        console.warn(`[dflowServer] Candlesticks API Error (${response.status}) for mint ${mintAddress}`);
        return { candlesticks: [], ticker: '' };
    }

    return await response.json();
}

/**
 * Fetch event candlesticks from DFlow API (server-only)
 */
export async function fetchEventCandlesticksServer(
    eventTicker: string,
    options?: {
        startTs?: number;
        endTs?: number;
        periodInterval?: number;
    }
): Promise<EventCandlesticksResponse> {
    const queryParams = new URLSearchParams();
    if (options?.startTs) queryParams.append("startTs", options.startTs.toString());
    if (options?.endTs) queryParams.append("endTs", options.endTs.toString());
    if (options?.periodInterval) queryParams.append("periodInterval", options.periodInterval.toString());

    const url = `${METADATA_API_BASE_URL}/api/v1/event/${encodeURIComponent(eventTicker)}/candlesticks${queryParams.toString() ? `?${queryParams.toString()}` : ''}`;

    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
        cache: 'no-store',
    });

    if (!response.ok) {
        console.warn(`[dflowServer] Event Candlesticks API Error (${response.status}) for event ${eventTicker}`);
        return { adjusted_end_ts: 0, market_candlesticks: [], market_tickers: [] };
    }

    return await response.json();
}

/**
 * Request order/quote from DFlow Trade API (server-only)
 * Automatically applies platform fees based on trade direction:
 * - Buy (USDC → token): platformFeeMode = inputMint (fee from USDC input)
 * - Sell (token → USDC): platformFeeMode = outputMint (fee from USDC output)
 */
export async function requestOrderServer(params: OrderRequest): Promise<OrderResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append("userPublicKey", params.userPublicKey);
    queryParams.append("inputMint", params.inputMint);
    queryParams.append("outputMint", params.outputMint);
    queryParams.append("amount", params.amount);
    
    // Only add sponsor if we have the private key to sign with
    if (sponsorKeypair) {
        queryParams.append("sponsor", SPONSOR_PUBLIC_KEY);
    }
    
    // Add outcomeAccountRentRecipient to reclaim rent from closed outcome accounts
    queryParams.append("outcomeAccountRentRecipient", SPONSOR_PUBLIC_KEY);

    const slippageBps = params.slippageBps ?? 100;
    queryParams.append("slippageBps", slippageBps.toString());

    // Add platform fee parameters only if enabled
    // Set ENABLE_PLATFORM_FEES=true in .env to enable
    if (ENABLE_PLATFORM_FEES) {
        queryParams.append("platformFeeScale", PLATFORM_FEE_SCALE);
        queryParams.append("feeAccount", PLATFORM_FEE_ACCOUNT);
    }

    const url = `${TRADE_API_BASE_URL}/order?${queryParams.toString()}`;

    console.log('[dflowServer] Requesting order:', {
        userPublicKey: params.userPublicKey,
        inputMint: params.inputMint,
        outputMint: params.outputMint,
        amount: params.amount,
        slippageBps,
        outcomeAccountRentRecipient: SPONSOR_PUBLIC_KEY,
        platformFeesEnabled: ENABLE_PLATFORM_FEES,
        ...(ENABLE_PLATFORM_FEES && {
            platformFeeScale: PLATFORM_FEE_SCALE,
            feeAccount: PLATFORM_FEE_ACCOUNT,
        }),
    });

    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
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
            }

            if (errorJson.code === 'route_not_found') {
                errorMessage = `No trading route found for this token pair. The market may not have sufficient liquidity.`;
            }
        } catch (e) {
            if (errorText) {
                errorMessage += ` - ${errorText}`;
            }
        }

        throw new Error(errorMessage);
    }

    const data = await response.json();
    if (data.transaction) {
        data.transaction = signWithSponsor(data.transaction);
    } else if (data.openTransaction) {
        data.openTransaction = signWithSponsor(data.openTransaction);
    }
    console.log('[dflowServer] Order response:', {
        hasTransaction: !!data.transaction,
        hasOpenTransaction: !!data.openTransaction,
        executionMode: data.executionMode,
        inAmount: data.inAmount,
        outAmount: data.outAmount,
    });
    return data;
}

/**
 * Request a lightweight quote preview without sponsorship or fees.
 */
export async function requestOrderPreviewServer(
    params: OrderPreviewRequest
): Promise<OrderResponse> {
    const queryParams = new URLSearchParams();
    queryParams.append("inputMint", params.inputMint);
    queryParams.append("outputMint", params.outputMint);
    queryParams.append("amount", params.amount);

    const url = `${TRADE_API_BASE_URL}/order?${queryParams.toString()}`;
    const response = await fetch(url, {
        method: "GET",
        headers: getHeaders(),
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
 * Fetch tags by categories from DFlow API (server-only)
 */
export async function fetchTagsByCategoriesServer(): Promise<Record<string, string[]>> {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/tags_by_categories`,
        {
            method: "GET",
            headers: getHeaders(),
        }
    );

    if (!response.ok) {
        throw new Error(`Failed to fetch tags by categories: ${response.statusText}`);
    }

    const data = await response.json();
    return data.tagsByCategories || {};
}

/**
 * Fetch series from DFlow API (server-only)
 */
export async function fetchSeriesServer(params?: {
    category?: string;
    tags?: string;
    status?: string;
    isInitialized?: boolean;
}): Promise<Series[]> {
    const queryParams = new URLSearchParams();
    if (params?.category) {
        queryParams.append("category", params.category);
    }
    if (params?.tags) {
        queryParams.append("tags", params.tags);
    }
    if (params?.status) {
        queryParams.append("status", params.status);
    }
    if (params?.isInitialized !== undefined) {
        queryParams.append("isInitialized", params.isInitialized ? "true" : "false");
    }

    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/series${queryParams.toString() ? `?${queryParams.toString()}` : ''}`,
        {
            method: "GET",
            headers: getHeaders(),
            cache: 'no-store',
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[dflowServer] Series API Error (${response.status}):`, errorText);
        throw new Error(`Failed to fetch series: ${response.status} ${response.statusText}`);
    }

    const data: SeriesResponse = await response.json();
    return data.series || [];
}

/**
 * Fetch events by series tickers from DFlow API (server-only)
 */
export async function fetchEventsBySeriesServer(
    seriesTickers: string | string[],
    options?: {
        withNestedMarkets?: boolean;
        status?: string;
        limit?: number;
    }
): Promise<Event[]> {
    const tickers = Array.isArray(seriesTickers) ? seriesTickers : [seriesTickers];

    // API has a limit of 25 tickers per request
    const CHUNK_SIZE = 25;
    const chunkPromises = [];

    for (let i = 0; i < tickers.length; i += CHUNK_SIZE) {
        const chunk = tickers.slice(i, i + CHUNK_SIZE);
        const queryParams = new URLSearchParams();
        queryParams.append("seriesTickers", chunk.join(","));

        if (options?.withNestedMarkets) {
            queryParams.append("withNestedMarkets", "true");
        }
        if (options?.status) {
            queryParams.append("status", options.status);
        }

        // Distribution of limit is tricky with parallel requests. 
        // For simplicity in this consolidated view, we'll ask for the full limit per chunk 
        // (or a reasonable default) and then slice the combined result.
        // Since we are aggregating on the server, we can over-fetch slightly then trim.
        const reqLimit = options?.limit ? Math.min(options.limit, 100) : 100;
        queryParams.append("limit", reqLimit.toString());

        const url = `${METADATA_API_BASE_URL}/api/v1/events?${queryParams.toString()}`;

        chunkPromises.push(
            fetch(url, {
                method: "GET",
                headers: getHeaders(),
                cache: 'no-store',
            })
                .then(async (response) => {
                    if (!response.ok) {
                        const errorText = await response.text();
                        console.error(`[dflowServer] Chunk events fetch failed (${response.status}):`, errorText);
                        return []; // Return empty array on failure to allow partial success
                    }
                    const data: EventsResponse = await response.json();
                    return data.events || [];
                })
                .catch(err => {
                    console.error(`[dflowServer] Chunk events fetch network error:`, err);
                    return [];
                })
        );
    }

    try {
        const results = await Promise.all(chunkPromises);
        let allEvents = results.flat();

        // Deduplicate if needed (though unlikely with distinct series tickers)
        // Check uniqueness by ticker just in case
        const uniqueEventsMap = new Map();
        allEvents.forEach(e => uniqueEventsMap.set(e.ticker, e));
        allEvents = Array.from(uniqueEventsMap.values());

        // Apply overall limit if specified
        if (options?.limit && allEvents.length > options.limit) {
            allEvents = allEvents.slice(0, options.limit);
        }

        return await enrichEventsWithMetadata(allEvents);
    } catch (error: any) {
        console.error(`[dflowServer] Failed to fetch events by series:`, error);
        throw new Error(`Failed to fetch events by series: ${error.message}`);
    }
}

/**
 * Filter outcome mints from addresses (server-only)
 */
export async function filterOutcomeMintsServer(addresses: string[]): Promise<string[]> {
    const response = await fetch(
        `${METADATA_API_BASE_URL}/api/v1/filter_outcome_mints`,
        {
            method: "POST",
            headers: getHeaders(),
            body: JSON.stringify({ addresses }),
        }
    );

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[dflowServer] filterOutcomeMints Error:', errorText);
        throw new Error(`Failed to filter outcome mints: ${response.statusText}`);
    }

    const data = await response.json();
    return data.outcomeMints || [];
}

/**
 * Fetch market by mint address (server-only)
 */
export async function fetchMarketByMintServer(mintAddress: string): Promise<Market | null> {
    try {
        const response = await fetch(
            `${METADATA_API_BASE_URL}/api/v1/market/by-mint/${mintAddress}`,
            {
                method: "GET",
                headers: getHeaders(),
                cache: 'no-store',
            }
        );

        if (!response.ok) {
            console.warn(`[dflowServer] Market by-mint API Error (${response.status}) for mint ${mintAddress}`);
            return null;
        }

        return await response.json();
    } catch (error) {
        console.error(`[dflowServer] Error fetching market by mint ${mintAddress}:`, error);
        return null;
    }
}

/**
 * Fetch markets batch by mints (server-only)
 * Uses /api/v1/markets/batch endpoint as documented
 */
export async function fetchMarketsBatchServer(mints: string[]): Promise<Market[]> {
    if (!mints || mints.length === 0) {
        return [];
    }

    console.log(`[dflowServer] Fetching ${mints.length} markets via batch endpoint...`);
    console.log(`[dflowServer] API URL: ${METADATA_API_BASE_URL}/api/v1/markets/batch`);
    console.log(`[dflowServer] Has API key: ${!!DFLOW_API_KEY}`);

    try {
        // Try batch endpoint first (as per guide)
        const response = await fetch(
            `${METADATA_API_BASE_URL}/api/v1/markets/batch`,
            {
                method: "POST",
                headers: getHeaders(),
                body: JSON.stringify({ mints }),
            }
        );

        if (response.ok) {
            const data = await response.json();
            console.log(`[dflowServer] Batch endpoint success, got ${(data.markets || []).length} markets`);
            return data.markets || [];
        }

        // Log the error details for debugging
        const errorText = await response.text();
        console.warn(`[dflowServer] Batch endpoint failed (${response.status}): ${errorText}`);
        console.log(`[dflowServer] Falling back to individual fetch...`);

    } catch (error) {
        console.warn(`[dflowServer] Batch endpoint error, falling back to individual fetch:`, error);
    }

    // Fallback: fetch markets individually in parallel
    const results = await Promise.allSettled(
        mints.map(mint => fetchMarketByMintServer(mint))
    );

    const markets: Market[] = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && result.value !== null) {
            markets.push(result.value);
        }
    }

    console.log(`[dflowServer] Individual fetch: got ${markets.length}/${mints.length} markets`);
    return markets;
}

// Common mint addresses (can be exposed)
export const SOL_MINT = "So11111111111111111111111111111111111111112";
export const USDC_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
