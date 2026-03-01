import { AuthError, BootstrapOAuthUserRequest, BootstrapOAuthUserResponse, CandleData, CopySettings, CreateCopySettingsRequest, CreatePostRequest, CreateTradeRequest, DelegationStatus, Event, EventEvidence, EvidenceResponse, Follow, Market, OnboardingStep, PositionsResponse, Post, PriceHistoryPoint, Series, SyncUserRequest, TagsResponse, Trade, User, UsernameCheckResponse, UserPositionsResponse } from './types';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://hunch-poly.vercel.app';

// Auth token getter - must be set by the app before making authenticated calls
let _getAccessToken: (() => Promise<string | null>) | null = null;

export const setAccessTokenGetter = (getter: () => Promise<string | null>) => {
    _getAccessToken = getter;
};

// Helper to safely parse JSON responses
const safeJsonParse = async (response: Response) => {
    const text = await response.text();
    if (!text || text.trim() === '') {
        return null;
    }
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
};

// Check if error is an auth error
const isAuthError = (error: any): error is AuthError => {
    return error?.code && ['MISSING_TOKEN', 'INVALID_TOKEN', 'USER_NOT_FOUND', 'DELEGATION_REQUIRED'].includes(error.code);
};

// Authenticated fetch helper - auto-injects Privy JWT
// Exported for use in other service files (e.g. tradeService.ts)
export const authenticatedFetch = async (
    url: string,
    options: RequestInit = {}
): Promise<Response> => {
    if (!_getAccessToken) {
        // Auth not initialized yet - treat as missing token
        const error: AuthError = { code: 'MISSING_TOKEN', error: 'Authentication not initialized' };
        throw error;
    }

    const accessToken = await _getAccessToken();
    if (!accessToken) {
        const error: AuthError = { code: 'MISSING_TOKEN', error: 'No access token available' };
        throw error;
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${accessToken}`);
    headers.set('Content-Type', 'application/json');

    return fetch(url, {
        ...options,
        headers,
    });
};

export const api = {
    // User endpoints
    bootstrapOAuthUser: async (data: BootstrapOAuthUserRequest): Promise<BootstrapOAuthUserResponse> => {
        const response = await fetch(`${API_BASE_URL}/api/auth/bootstrap-oauth-user`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to bootstrap OAuth user');
        }
        const result = await safeJsonParse(response);
        return result as BootstrapOAuthUserResponse;
    },

    syncUser: async (data: SyncUserRequest): Promise<User> => {
        const response = await fetch(`${API_BASE_URL}/api/users/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to sync user');
        }
        const result = await safeJsonParse(response);
        return result as User;
    },

    getUser: async (userId: string): Promise<User> => {
        const cached = userCache.get(userId);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) return cached.data;
        const response = await fetch(`${API_BASE_URL}/api/users/${userId}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to get user');
        }
        const user = await response.json();
        userCache.set(userId, { data: user, timestamp: Date.now() });
        return user;
    },

    registerPushToken: async (expoPushToken: string): Promise<void> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/push-token`, {
            method: 'POST',
            body: JSON.stringify({ expoPushToken }),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to register push token');
        }
    },

    removePushToken: async (): Promise<void> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/push-token`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to remove push token');
        }
    },

    savePreferences: async (userId: string, preferences: { interests?: string[]; habits?: string[]; hasCompletedOnboarding: boolean }): Promise<void> => {
        // Transform to backend format: {preferences: [...]}
        const body = {
            preferences: preferences.interests || [],
        };
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/${userId}/preferences`, {
            method: 'POST',
            body: JSON.stringify(body),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to save preferences');
        }
        // Success - no need to parse response body
    },

    getUserPreferences: async (userId: string): Promise<{ interests?: string[]; habits?: string[]; hasCompletedOnboarding?: boolean } | null> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/${userId}/preferences`);
        if (!response.ok) {
            if (response.status === 404) {
                return null;
            }
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to get preferences');
        }
        const result = await safeJsonParse(response);
        if (!result) {
            return null;
        }
        return result as { interests?: string[]; habits?: string[]; hasCompletedOnboarding?: boolean };
    },

    getTopUsers: async (sortBy: 'followers' | 'trades' = 'followers', limit: number = 4): Promise<User[]> => {
        const response = await fetch(`${API_BASE_URL}/api/users/top?sortBy=${sortBy}&limit=${limit}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to get top users');
        }
        const result = await safeJsonParse(response);
        return result || [];
    },

    searchUsers: async (query: string): Promise<User[]> => {
        const response = await fetch(`${API_BASE_URL}/api/users/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to search users');
        }
        return response.json();
    },

    checkUsernameAvailability: async (username: string): Promise<UsernameCheckResponse> => {
        const response = await fetch(`${API_BASE_URL}/api/users/username/check?username=${encodeURIComponent(username)}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to check username availability');
        }
        const result = await safeJsonParse(response);
        return result as UsernameCheckResponse;
    },

    claimUsername: async (username: string): Promise<User> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/username/claim`, {
            method: 'POST',
            body: JSON.stringify({ username }),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            if (isAuthError(error)) throw error;
            throw new Error(error?.error || 'Failed to claim username');
        }
        const result = await safeJsonParse(response);
        return result as User;
    },

    saveOnboardingProgress: async (data: { step?: OnboardingStep; completed?: boolean; currentStep?: OnboardingStep }): Promise<{ onboardingStep?: OnboardingStep; hasCompletedOnboarding?: boolean }> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/onboarding/progress`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            if (isAuthError(error)) throw error;
            throw new Error(error?.error || 'Failed to save onboarding progress');
        }
        const result = await safeJsonParse(response);
        return (result || {}) as { onboardingStep?: OnboardingStep; hasCompletedOnboarding?: boolean };
    },

    // Follow endpoints (authenticated - followerId derived from JWT token)
    followUser: async (followingId: string): Promise<Follow> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/follow`, {
            method: 'POST',
            body: JSON.stringify({ followingId }),
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to follow user');
        }
        return response.json();
    },

    unfollowUser: async (followingId: string): Promise<{ success: boolean }> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/follow`, {
            method: 'DELETE',
            body: JSON.stringify({ followingId }),
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to unfollow user');
        }
        return response.json();
    },

    getFollowing: async (userId: string): Promise<Follow[]> => {
        const response = await fetch(`${API_BASE_URL}/api/follow/following?userId=${userId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get following');
        }
        return response.json();
    },

    getFollowers: async (userId: string): Promise<Follow[]> => {
        const response = await fetch(`${API_BASE_URL}/api/follow/followers?userId=${userId}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get followers');
        }
        return response.json();
    },

    // Trade endpoints (authenticated - userId derived from JWT token)
    createTrade: async (data: CreateTradeRequest): Promise<Trade> => {
        // Remove userId from body - backend derives from auth token
        const { userId, ...tradeData } = data;
        const response = await authenticatedFetch(`${API_BASE_URL}/api/trades`, {
            method: 'POST',
            body: JSON.stringify(tradeData),
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to create trade');
        }
        return response.json();
    },

    getUserTrades: async (userId: string, limit = 50, offset = 0): Promise<Trade[]> => {
        const response = await fetch(`${API_BASE_URL}/api/trades?userId=${userId}&limit=${limit}&offset=${offset}`);
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get trades');
        }
        return response.json();
    },

    getTrade: async (tradeId: string): Promise<Trade | null> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/trades/${tradeId}`);
        if (!response.ok) {
            if (response.status === 404) return null;
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to get trade');
        }
        const result = await safeJsonParse(response);
        return result as Trade | null;
    },

    getPositions: async (userId: string): Promise<PositionsResponse> => {
        const response = await fetch(`${API_BASE_URL}/api/positions?userId=${userId}&includeStats=true`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error((error as any)?.error || 'Failed to get positions');
        }
        const result = await safeJsonParse(response);
        if (!result) {
            throw new Error('Failed to get positions');
        }
        return result as PositionsResponse;
    },

    updateTradeQuote: async (tradeId: string, quote: string): Promise<Trade | null> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/trades`, {
            method: 'PATCH',
            body: JSON.stringify({ tradeId, quote }),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to update trade quote');
        }
        // Handle empty responses (204 No Content or empty body)
        const result = await safeJsonParse(response);
        return result as Trade | null;
    },

    // Feed endpoint
    getFeed: async ({
        userId,
        mode = 'following',
        limit = 50,
        offset = 0,
    }: {
        userId?: string;
        mode?: 'following' | 'global';
        limit?: number;
        offset?: number;
    }): Promise<Trade[]> => {
        const params = new URLSearchParams({
            limit: limit.toString(),
            offset: offset.toString(),
            mode,
        });
        if (userId && mode === 'following') {
            params.append('userId', userId);
        }
        const url = `${API_BASE_URL}/api/feed?${params.toString()}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);
        const response = await fetch(url, { signal: controller.signal }).finally(() => {
            clearTimeout(timeoutId);
        });
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Failed to get feed');
        }
        return response.json();
    },

    // Fetch event evidence (news signals)
    fetchEvidence: async (eventTickers: string[]): Promise<EventEvidence[]> => {
        const tickersParam = eventTickers.join(',');
        const response = await fetch(`${API_BASE_URL}/api/events/evidence?eventTickers=${encodeURIComponent(tickersParam)}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error((error as any)?.error || 'Failed to fetch evidence');
        }
        const data = (await safeJsonParse(response)) as EvidenceResponse | null;
        if (!data) {
            return [];
        }
        return data.evidence || [];
    },

    // Delegation Status endpoint (authenticated)
    getDelegationStatus: async (): Promise<DelegationStatus> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/users/delegation-status`, {
            method: 'GET',
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to get delegation status');
        }
        return response.json();
    },

    // Copy Trading Settings endpoints (authenticated)
    createCopySettings: async (settings: CreateCopySettingsRequest): Promise<CopySettings> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/copy-settings`, {
            method: 'POST',
            body: JSON.stringify(settings),
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to create copy settings');
        }
        return response.json();
    },

    getCopySettings: async (leaderId?: string): Promise<CopySettings[]> => {
        const url = leaderId
            ? `${API_BASE_URL}/api/copy-settings?leaderId=${leaderId}`
            : `${API_BASE_URL}/api/copy-settings`;
        const response = await authenticatedFetch(url, {
            method: 'GET',
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to get copy settings');
        }
        const data = await response.json();
        // API returns single object when leaderId specified, array when not
        return Array.isArray(data) ? data : [data];
    },

    deleteCopySettings: async (leaderId: string): Promise<{ success: boolean }> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/copy-settings`, {
            method: 'DELETE',
            body: JSON.stringify({ leaderId }),
        });
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to delete copy settings');
        }
        return response.json();
    },

    updateCopySettings: async (
        followerId: string,
        leaderId: string,
        action: 'toggle'
    ): Promise<CopySettings> => {
        const response = await authenticatedFetch(
            `${API_BASE_URL}/api/copy-settings/${followerId}/${leaderId}`,
            {
                method: 'PATCH',
                body: JSON.stringify({ action }),
            }
        );
        if (!response.ok) {
            const error = await response.json();
            if (isAuthError(error)) throw error;
            throw new Error(error.error || 'Failed to update copy settings');
        }
        return response.json();
    },

    // User positions via /api/users/:userId/positions (no auth required)
    getUserPositions: async (userId: string): Promise<UserPositionsResponse> => {
        const response = await fetch(`${API_BASE_URL}/api/users/${userId}/positions`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error((error as any)?.error || 'Failed to get user positions');
        }
        const result = await safeJsonParse(response);
        if (!result) throw new Error('Failed to get user positions');
        return result as UserPositionsResponse;
    },

    // Posts endpoints
    createPost: async (data: CreatePostRequest): Promise<Post> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/posts`, {
            method: 'POST',
            body: JSON.stringify(data),
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error((error as any)?.error || 'Failed to create post');
        }
        const result = await safeJsonParse(response);
        return result.post as Post;
    },

    deletePost: async (postId: string): Promise<void> => {
        const response = await authenticatedFetch(`${API_BASE_URL}/api/posts/${postId}`, {
            method: 'DELETE',
        });
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error((error as any)?.error || 'Failed to delete post');
        }
    },
};

// ─── Polymarket Response Mappers ─────────────────────────────────────────────

const mapPolymarketMarket = (raw: any): Market => {
    // Dome API uses side_a / side_b for outcomes
    const side_a = raw.side_a || { id: raw.primary_token_id || '', label: 'Yes' };
    const side_b = raw.side_b || { id: raw.secondary_token_id || '', label: 'No' };

    // Compute Yes probability from side_a token price if available
    // Dome API market doesn't carry bid/ask directly, but extra_fields may have price_to_beat / final_price
    const yesBidRaw = raw.best_bid ?? raw.yesBid ?? null;
    const yesAskRaw = raw.best_ask ?? raw.yesAsk ?? null;

    return {
        // Core Dome API fields
        market_slug: raw.market_slug || raw.slug || '',
        event_slug: raw.event_slug || undefined,
        condition_id: raw.condition_id || '',
        title: raw.title || raw.question || '',
        description: raw.description || undefined,
        image: raw.image || undefined,
        tags: raw.tags || [],
        start_time: raw.start_time || undefined,
        end_time: raw.end_time || undefined,
        completed_time: raw.completed_time ?? null,
        close_time: raw.close_time ?? null,
        game_start_time: raw.game_start_time || null,
        volume_1_week: raw.volume_1_week || undefined,
        volume_1_month: raw.volume_1_month || undefined,
        volume_1_year: raw.volume_1_year || undefined,
        volume_total: raw.volume_total || undefined,
        side_a,
        side_b,
        winning_side: raw.winning_side ?? null,
        status: raw.status || 'open',
        resolution_source: raw.resolution_source || undefined,
        negative_risk_id: raw.negative_risk_id ?? null,
        extra_fields: raw.extra_fields || undefined,
        // Convenience aliases
        ticker: raw.condition_id || raw.market_slug || '',
        eventTicker: raw.event_slug || undefined,
        subtitle: raw.description || undefined,
        yesBid: yesBidRaw != null ? String(yesBidRaw) : null,
        yesAsk: yesAskRaw != null ? String(yesAskRaw) : null,
        image_url: raw.image || undefined,
        volume: raw.volume_total || undefined,
    };
};

const mapPolymarketEvent = (raw: any): Event => {
    const mappedMarkets: Market[] = Array.isArray(raw.markets)
        ? raw.markets.map((m: any) => mapPolymarketMarket(m))
        : [];

    return {
        // Core Dome API fields
        event_slug: raw.event_slug || raw.slug || '',
        title: raw.title || '',
        subtitle: raw.subtitle || undefined,
        image: raw.image || undefined,
        tags: Array.isArray(raw.tags) ? raw.tags : [],
        start_time: raw.start_time || undefined,
        end_time: raw.end_time || undefined,
        volume_fiat_amount: raw.volume_fiat_amount || undefined,
        status: raw.status || 'open',
        market_count: raw.market_count || mappedMarkets.length,
        markets: mappedMarkets,
        settlement_sources: raw.settlement_sources || undefined,
        rules_url: raw.rules_url ?? null,
        // Convenience aliases
        ticker: raw.event_slug || '',
        imageUrl: raw.image || undefined,
        category: Array.isArray(raw.tags) ? raw.tags[0] : undefined,
        volume: raw.volume_fiat_amount || undefined,
        closeTime: raw.end_time || undefined,
    };
};

// ─── Caches ──────────────────────────────────────────────────────────────────

const marketCache = new Map<string, { data: Market; timestamp: number }>();
const eventCache = new Map<string, { data: Event; timestamp: number }>();
const userCache = new Map<string, { data: User; timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

type HomeFeedResult = {
    events: Event[];
    topMarkets: Market[];
    cursor?: string;
    metadata?: { totalEvents: number; hasMore: boolean };
};
const HOME_FEED_REQUEST_CACHE_DURATION = 20 * 1000;
const homeFeedRequestCache = new Map<string, { data: HomeFeedResult; timestamp: number }>();
const homeFeedInFlightRequests = new Map<string, Promise<HomeFeedResult>>();

type EventsResult = { events: Event[]; cursor?: string };
const EVENTS_REQUEST_CACHE_DURATION = 20 * 1000;
const eventsRequestCache = new Map<string, { data: EventsResult; timestamp: number }>();

const CANDLESTICK_REQUEST_CACHE_DURATION = 20 * 1000;
const candlestickRequestCache = new Map<string, { data: CandleData[]; timestamp: number }>();
const candlestickInFlightRequests = new Map<string, Promise<CandleData[]>>();

const indexMappedEvents = (events: Event[]): void => {
    const now = Date.now();
    for (const event of events) {
        if (event.ticker) {
            eventCache.set(event.ticker, { data: event, timestamp: now });
        }
        if (event.event_slug) {
            eventCache.set(event.event_slug, { data: event, timestamp: now });
        }
        for (const market of event.markets || []) {
            if (market.ticker) {
                marketCache.set(market.ticker, { data: market, timestamp: now });
            }
            if (market.condition_id) {
                marketCache.set(market.condition_id, { data: market, timestamp: now });
            }
        }
    }
};

// ─── Polymarket Markets API ──────────────────────────────────────────────────

export const marketsApi = {
    /**
     * Fetch events from /api/polymarket/events
     */
    fetchEvents: async (
        limit: number = 20,
        options?: {
            status?: string;
            withNestedMarkets?: boolean;
            includeMarkets?: boolean;
            cursor?: string;
            category?: string;
            search?: string;
        }
    ): Promise<EventsResult> => {
        const params = new URLSearchParams({
            limit: String(Math.max(1, limit)),
            include_markets: 'true', // Always include markets for image data
        });
        if (options?.cursor) params.append('pagination_key', options.cursor);
        if (options?.status === 'active') params.append('status', 'open');
        if (options?.category && options.category !== 'all') params.append('tag', options.category);
        if (options?.search) params.append('search', options.search);

        const requestUrl = `${API_BASE_URL}/api/polymarket/events?${params.toString()}`;
        const now = Date.now();
        const cached = eventsRequestCache.get(requestUrl);
        if (cached && now - cached.timestamp < EVENTS_REQUEST_CACHE_DURATION) {
            return cached.data;
        }

        const response = await fetch(requestUrl);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || `Failed to fetch events: ${response.statusText}`);
        }

        const payload = (await safeJsonParse(response)) as any;
        const rawEvents = Array.isArray(payload?.events) ? payload.events : [];
        const events = rawEvents.map(mapPolymarketEvent);
        const pagination = payload?.pagination;
        const hasMore = pagination?.has_more ?? false;
        const nextCursor = hasMore ? pagination?.pagination_key || String(rawEvents.length) : undefined;
        const result = { events, cursor: nextCursor };

        eventsRequestCache.set(requestUrl, { data: result, timestamp: now });
        indexMappedEvents(events);
        return result;
    },

    /**
     * Fetch markets from /api/polymarket/markets
     */
    fetchMarkets: async (limit: number = 200): Promise<Market[]> => {
        const response = await fetch(`${API_BASE_URL}/api/polymarket/markets?limit=${limit}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to fetch markets');
        }
        const payload = (await safeJsonParse(response)) as any;
        const rawMarkets = Array.isArray(payload?.markets) ? payload.markets : [];
        return rawMarkets.map(mapPolymarketMarket);
    },

    /**
     * Fetch home feed (events + top markets)
     * Uses /api/polymarket/events as the primary data source
     */
    fetchHomeFeed: async (
        limit: number = 20,
        cursor?: string,
        category?: string
    ): Promise<HomeFeedResult> => {
        const pageSize = Math.max(1, limit);
        const params = new URLSearchParams({
            limit: String(pageSize),
            status: 'open',
            include_markets: 'true', // Need nested markets for image carousel
        });
        if (cursor) params.append('pagination_key', cursor);
        if (category && category !== 'all') params.append('tag', category);

        const requestUrl = `${API_BASE_URL}/api/polymarket/events?${params.toString()}`;
        const now = Date.now();
        const cached = homeFeedRequestCache.get(requestUrl);
        if (cached && now - cached.timestamp < HOME_FEED_REQUEST_CACHE_DURATION) {
            return cached.data;
        }

        const existingRequest = homeFeedInFlightRequests.get(requestUrl);
        if (existingRequest) {
            return existingRequest;
        }

        const requestPromise = (async () => {
            const response = await fetch(requestUrl);
            if (!response.ok) {
                const error = await safeJsonParse(response);
                throw new Error(error?.error || `Failed to fetch home feed: ${response.statusText}`);
            }

            const payload = (await safeJsonParse(response)) as any;
            const rawEvents = Array.isArray(payload?.events) ? payload.events : [];
            const events = rawEvents.map(mapPolymarketEvent);

            // Extract top markets from events — prefer those with valid images
            const allMarkets = events.flatMap((e: Event) => (e.markets || []).map((m: Market) => ({
                ...m,
                eventTicker: m.eventTicker || e.event_slug,
            })));
            const topMarkets = allMarkets
                .filter((m: Market) => m.image_url || m.image)
                .sort((a: Market, b: Market) => (b.volume_total || 0) - (a.volume_total || 0))
                .slice(0, 10);

            const pagination = payload?.pagination;
            const hasMore = pagination?.has_more ?? false;
            const nextCursor = hasMore ? pagination?.pagination_key || String(rawEvents.length) : undefined;

            indexMappedEvents(events);
            for (const market of topMarkets) {
                if (market.ticker) {
                    marketCache.set(market.ticker, { data: market, timestamp: now });
                }
            }

            const result: HomeFeedResult = {
                events,
                topMarkets,
                cursor: nextCursor,
                metadata: {
                    totalEvents: events.length,
                    hasMore,
                },
            };

            homeFeedRequestCache.set(requestUrl, { data: result, timestamp: now });
            return result;
        })();

        homeFeedInFlightRequests.set(requestUrl, requestPromise);
        try {
            return await requestPromise;
        } finally {
            homeFeedInFlightRequests.delete(requestUrl);
        }
    },

    /**
     * Fetch event details by slug
     */
    fetchEventDetails: async (eventSlug: string): Promise<Event> => {
        const now = Date.now();
        const cached = eventCache.get(eventSlug);
        if (cached && now - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        const response = await fetch(`${API_BASE_URL}/api/polymarket/events/${encodeURIComponent(eventSlug)}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || `Failed to fetch event details for ${eventSlug}`);
        }

        const raw = await safeJsonParse(response);
        const event = mapPolymarketEvent(raw);
        eventCache.set(eventSlug, { data: event, timestamp: now });
        if (event.ticker) eventCache.set(event.ticker, { data: event, timestamp: now });
        return event;
    },

    /**
     * Fetch market details by condition ID or slug
     */
    fetchMarketDetails: async (conditionId: string): Promise<Market> => {
        const now = Date.now();
        const cached = marketCache.get(conditionId);
        if (cached && now - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }

        const response = await fetch(`${API_BASE_URL}/api/polymarket/markets/${encodeURIComponent(conditionId)}`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || `Market not found: ${conditionId}`);
        }

        const raw = await safeJsonParse(response);
        const market = mapPolymarketMarket(raw);
        marketCache.set(conditionId, { data: market, timestamp: now });
        if (market.ticker) marketCache.set(market.ticker, { data: market, timestamp: now });
        return market;
    },

    /**
     * Fetch candlestick / price history for a market using the Dome API proxy.
     * Accepts marketTicker (condition_id) and time range.
     */
    fetchCandlesticksByMint: async ({
        ticker,
        marketTicker,
        marketId,
        startTs,
        endTs,
        periodInterval,
    }: {
        ticker?: string;
        marketTicker?: string;
        marketId?: string;
        seriesTicker?: string | null;
        startTs?: number;
        endTs?: number;
        periodInterval?: number;
    }): Promise<CandleData[]> => {
        const conditionId = marketTicker || marketId || ticker;
        if (!conditionId) return [];

        const now = Date.now();
        const endTime = endTs ?? Math.floor(now / 1000);
        const startTime = startTs ?? Math.max(0, endTime - 7 * 24 * 60 * 60);
        // Map periodInterval → Dome API interval (1=1m, 60=1h, 1440=1d)
        const interval = periodInterval === 1440 ? 1440
            : periodInterval === 1 ? 1
                : 60; // Default 1h

        const cacheKey = `${conditionId}:${startTime}:${endTime}:${interval}`;
        const cachedEntry = candlestickRequestCache.get(cacheKey);
        if (cachedEntry && now - cachedEntry.timestamp < CANDLESTICK_REQUEST_CACHE_DURATION) {
            return cachedEntry.data;
        }

        const inFlight = candlestickInFlightRequests.get(cacheKey);
        if (inFlight) return inFlight;

        const requestPromise = (async () => {
            const params = new URLSearchParams({
                start_time: String(startTime),
                end_time: String(endTime),
                interval: String(interval),
            });
            const url = `${API_BASE_URL}/api/polymarket/candlesticks/${encodeURIComponent(conditionId)}?${params.toString()}`;
            const response = await fetch(url);
            if (!response.ok) {
                return []; // Chart data may not be available for all markets
            }

            const payload = (await safeJsonParse(response)) as any;
            const candles: CandleData[] = Array.isArray(payload?.candlesticks)
                ? payload.candlesticks
                : [];

            candlestickRequestCache.set(cacheKey, { data: candles, timestamp: now });
            return candles;
        })();

        candlestickInFlightRequests.set(cacheKey, requestPromise);
        try {
            return await requestPromise;
        } finally {
            candlestickInFlightRequests.delete(cacheKey);
        }
    },

    /**
     * Fetch top 6 events for a specific category (or all categories for 'hot').
     * Uses include_markets=true so the carousel can show market images.
     */
    fetchTopEventsByCategory: async (
        category: string, // e.g. 'crypto', 'politics', 'sports', 'all'
        limit: number = 6
    ): Promise<{ events: Event[]; hotMarkets: Market[] }> => {
        const params = new URLSearchParams({
            limit: String(Math.max(limit, 20)), // Fetch more so we can pick top 6
            status: 'open',
            include_markets: 'true',
        });
        if (category && category !== 'all') {
            params.append('tag', category);
        }

        const requestUrl = `${API_BASE_URL}/api/polymarket/events?${params.toString()}`;
        const now = Date.now();
        const cached = eventsRequestCache.get(requestUrl);
        if (cached && now - cached.timestamp < EVENTS_REQUEST_CACHE_DURATION) {
            const events = cached.data.events.slice(0, limit);
            const hotMarkets = events
                .flatMap(e => (e.markets || []).map(m => ({ ...m, eventTicker: m.eventTicker || e.event_slug })))
                .filter(m => m.image_url || m.image)
                .sort((a, b) => (b.volume_total || 0) - (a.volume_total || 0))
                .slice(0, 10);
            return { events, hotMarkets };
        }

        const response = await fetch(requestUrl);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || `Failed to fetch events: ${response.statusText}`);
        }

        const payload = (await safeJsonParse(response)) as any;
        const rawEvents = Array.isArray(payload?.events) ? payload.events : [];
        const allEvents = rawEvents.map(mapPolymarketEvent);

        // Sort by volume descending, keep top `limit`
        const sortedEvents = [...allEvents].sort((a, b) => (b.volume_fiat_amount || 0) - (a.volume_fiat_amount || 0));
        const events = sortedEvents.slice(0, limit);

        // Extract hot markets from the full event list (more diversity)
        const hotMarkets = allEvents
            .flatMap((e: Event) => (e.markets || []).map((m: Market) => ({ ...m, eventTicker: m.eventTicker || e.event_slug })))
            .filter((m: Market) => m.image_url || m.image)
            .sort((a: Market, b: Market) => (b.volume_total || 0) - (a.volume_total || 0))
            .slice(0, 10);

        // Cache the full result
        const fullResult: EventsResult = { events: allEvents, cursor: undefined };
        eventsRequestCache.set(requestUrl, { data: fullResult, timestamp: now });
        indexMappedEvents(allEvents);

        return { events, hotMarkets };
    },

    fetchTags: async (): Promise<TagsResponse> => ({ tagsByCategories: {} }),
    fetchSeries: async (): Promise<Series[]> => [],
    fetchMarketByMint: async (): Promise<Market> => { throw new Error('Not supported'); },
    fetchMarketsBatch: async (): Promise<Market[]> => [],
    filterOutcomeMints: async (): Promise<string[]> => [],
    fetchEventsBySeries: async (
        _seriesTickers: string | string[],
        options?: { withNestedMarkets?: boolean; status?: string; limit?: number }
    ): Promise<Event[]> => {
        const { events } = await marketsApi.fetchEvents(options?.limit || 100, {
            withNestedMarkets: options?.withNestedMarkets,
            status: options?.status,
        });
        return events;
    },

    /**
     * Fetch the live list of categories (tags) from the backend /api/categories endpoint.
     * Each category has { id, slug, label }. The first entry is always { id: 'all', slug: 'all', label: 'All' }.
     */
    fetchCategories: async (): Promise<{ id: string; slug: string; label: string }[]> => {
        const cacheKey = 'categories';
        const now = Date.now();
        const CACHE_MS = 10 * 60 * 1000; // 10 minutes

        // Simple in-memory cache
        const cached = (marketsApi as any)._categoriesCache as { data: { id: string; slug: string; label: string }[]; ts: number } | undefined;
        if (cached && now - cached.ts < CACHE_MS) {
            return cached.data;
        }

        const response = await fetch(`${API_BASE_URL}/api/categories`);
        if (!response.ok) {
            const error = await safeJsonParse(response);
            throw new Error(error?.error || 'Failed to fetch categories');
        }
        const result = await safeJsonParse(response) as { categories: { id: string; slug: string; label: string }[] };
        const categories = result?.categories || [];
        (marketsApi as any)._categoriesCache = { data: categories, ts: now };
        return categories;
    },
};

// ─── Convenience helpers ─────────────────────────────────────────────────────

export const getMarketDetails = async (ticker: string): Promise<Market | null> => {
    try {
        const cached = marketCache.get(ticker);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
        const market = await marketsApi.fetchMarketDetails(ticker);
        marketCache.set(ticker, { data: market, timestamp: Date.now() });
        return market;
    } catch (error) {
        console.error(`Failed to fetch market details for ${ticker}:`, error);
        return null;
    }
};

export const getEventDetails = async (eventSlug: string): Promise<Event | null> => {
    try {
        const cached = eventCache.get(eventSlug);
        if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
            return cached.data;
        }
        const event = await marketsApi.fetchEventDetails(eventSlug);
        eventCache.set(eventSlug, { data: event, timestamp: Date.now() });
        return event;
    } catch (error) {
        console.error(`Failed to fetch event details for ${eventSlug}:`, error);
        return null;
    }
};
