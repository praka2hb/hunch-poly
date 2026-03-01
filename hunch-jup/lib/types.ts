// TypeScript types for backend API responses

export interface User {
    id: string;
    privyId: string;
    walletAddress: string;
    displayName: string | null;
    username?: string | null;
    avatarUrl: string | null;
    followerCount: number;
    followingCount: number;
    onboardingStep?: OnboardingStep;
    hasCompletedOnboarding?: boolean;
    walletReady?: boolean;
    createdAt: string;
    updatedAt: string;
    _count?: {
        trades: number;
    };
}

export type OnboardingStep =
    | 'LINK_X'
    | 'USERNAME'
    | 'INTERESTS'
    | 'SUGGESTED_FOLLOWERS'
    | 'COMPLETE';

export interface BootstrapOAuthUserRequest {
    privyId: string;
    provider: 'apple' | 'twitter' | 'google' | string;
    linkedAccounts?: Array<Record<string, any>>;
    username?: string;
    displayName?: string;
}

export interface BootstrapOAuthUserResponse {
    user: User;
    walletReady: boolean;
    onboardingStep: OnboardingStep;
    isNewUser: boolean;
}

export interface UsernameCheckResponse {
    username: string;
    normalizedUsername: string;
    available: boolean;
    reason?: string;
}

export interface Trade {
    id: string;
    userId: string;
    marketTicker: string;
    eventTicker?: string | null;
    side: 'yes' | 'no';
    action?: 'BUY' | 'SELL';
    amount: string;
    transactionSig: string;
    quote?: string | null;
    isDummy?: boolean;
    createdAt: string;
    user?: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
}

export interface TradeWithDetails extends Trade {
    market?: Market | null;
    event?: Event | null;
}

export interface AggregatedPosition {
    marketTicker: string;
    eventTicker: string | null;
    side: 'yes' | 'no';
    totalTokenAmount: number;
    totalUsdcAmount: number;
    averageEntryPrice: number;
    currentPrice: number | null;
    currentValue: number | null;
    profitLoss: number | null;
    profitLossPercentage: number | null;
    tradeCount: number;
    market: Market | null;
    eventImageUrl: string | null;
    trades: TradeWithDetails[];
    totalCostBasis: number;
    totalTokensBought: number;
    totalTokensSold: number;
    totalSellProceeds: number;
    realizedPnL: number;
    unrealizedPnL: number | null;
    totalPnL: number | null;
    positionStatus: 'OPEN' | 'CLOSED' | 'PARTIALLY_CLOSED';
}

export interface PositionStats {
    [key: string]: number | null;
}

export interface PositionsResponse {
    positions: {
        active: AggregatedPosition[];
        previous: AggregatedPosition[];
    };
    stats: PositionStats | null;
}

export interface Follow {
    id: string;
    followerId: string;
    followingId: string;
    createdAt: string;
    follower: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
    following: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
}

export interface SyncUserRequest {
    privyId: string;
    walletAddress: string;
    displayName?: string;
    avatarUrl?: string;
    preferences?: string[];
}

export interface CreateTradeRequest {
    userId?: string; // Optional - backend derives from auth token
    marketTicker: string;
    eventTicker?: string;
    side: 'yes' | 'no';
    action?: 'BUY' | 'SELL';
    amount: string;
    quote?: string;
    walletAddress?: string;
    transactionSig?: string;
    executedInAmount?: string;  // Raw amount of tokens/USDC sent
    executedOutAmount?: string; // Raw amount of tokens/USDC received
    entryPrice?: string;
    isDummy?: boolean;
}

export interface ApiError {
    error: string;
}

// Copy Trading Settings Types
export interface CopySettings {
    id: string;
    followerId: string;
    leaderId: string;
    amountPerTrade: number;
    maxTotalAmount: number;
    spentAmount: number;
    isActive: boolean;
    expiresAt?: string;
    createdAt: string;
    updatedAt: string;
    leader?: User;
}

export interface CreateCopySettingsRequest {
    leaderId: string;
    amountPerTrade: number;
    maxTotalAmount: number;
    expiresAt?: string;
    delegationSignature?: string;
    signedMessage?: string;
}

// Auth Error Types
export type AuthErrorCode = 'MISSING_TOKEN' | 'INVALID_TOKEN' | 'USER_NOT_FOUND' | 'DELEGATION_REQUIRED';

export interface AuthError {
    code: AuthErrorCode;
    error: string;
}

// Delegation Status Types (for copy trading)
export interface DelegationStatus {
    hasClobCredentials: boolean;
    walletAddress: string | null;
}

// ─── Polymarket API Types ────────────────────────────────────────────────────

// A side (outcome) of a binary market
export interface MarketSide {
    id: string;   // token ID for CLOB trading
    label: string; // e.g. "Yes", "No", "Up", "Down"
}

export interface Market {
    // Identifiers
    market_slug: string;
    event_slug?: string;
    condition_id: string;
    // Display
    title: string;
    description?: string;
    image?: string;
    tags?: string[];
    // Timing
    start_time?: number;
    end_time?: number;
    completed_time?: number | null;
    close_time?: number | null;
    game_start_time?: string | null;
    // Volume
    volume_1_week?: number;
    volume_1_month?: number;
    volume_1_year?: number;
    volume_total?: number;
    // Outcomes
    side_a: MarketSide;
    side_b: MarketSide;
    winning_side?: string | null;
    // Status
    status: string; // "open" | "closed" | "resolved"
    resolution_source?: string;
    negative_risk_id?: string | null;
    extra_fields?: Record<string, any>;

    // ── Convenience aliases (populated by mappers) ──
    /** @deprecated Use market_slug */
    ticker?: string;
    /** @deprecated Use event_slug */
    eventTicker?: string;
    subtitle?: string;
    yesBid?: string | null;
    yesAsk?: string | null;
    noBid?: string | null;
    noAsk?: string | null;
    image_url?: string;
    volume?: number;
    colorCode?: string;
}

export interface Event {
    // Identifiers
    event_slug: string;
    // Display
    title: string;
    subtitle?: string;
    image?: string;
    tags?: string[];
    // Timing
    start_time?: number;
    end_time?: number;
    // Volume
    volume_fiat_amount?: number;
    // Status
    status?: string; // "open" | "closed"
    // Markets
    market_count?: number;
    markets?: Market[];
    // Metadata
    settlement_sources?: string;
    rules_url?: string | null;

    // ── Convenience aliases (populated by mappers) ──
    /** @deprecated Use event_slug */
    ticker?: string;
    imageUrl?: string;
    category?: string;
    volume?: number;
    closeTime?: number;
}

export interface MarketsResponse {
    markets: Market[];
    pagination?: {
        limit: number;
        total?: number;
        has_more: boolean;
        pagination_key?: string;
    };
}

export interface EventsResponse {
    events: Event[];
    pagination?: {
        limit: number;
        has_more: boolean;
        pagination_key?: string;
    };
}

// Candlestick chart data types
export interface CandleData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface CandlesResponse {
    candles: CandleData[];
    marketTicker: string;
    resolution: string;
}

// Price history point from Polymarket
export interface PriceHistoryPoint {
    t: number;  // timestamp
    p: number;  // price
}

// Event Evidence Types (News/Signals)
export interface EventEvidence {
    id: string;
    eventTicker: string;
    marketTicker: string;
    marketQuestion: string;
    evidenceSentence: string;
    highlightScore: number;
    classification: 'CONFIRMATION' | 'REQUIREMENT' | 'DELAY' | 'RISK' | 'NONE';
    headline?: string | null;
    explanation?: string | null;
    sourceUrls: string[];
    sourceTitle?: string | null;
    sourcePublishedAt?: string | null;
    createdAt: string;
    updatedAt?: string;
}

export interface EvidenceResponse {
    evidence: EventEvidence[];
}

// Tags and Series Types (for category filtering)
export interface TagsResponse {
    tagsByCategories: Record<string, string[]>;
}

export interface Series {
    ticker: string;
    title: string;
    category: string;
    tags?: string[];
    status?: string;
}

export interface SeriesResponse {
    series: Series[];
}

// User Positions from /api/polymarket/positions
export interface UserPosition {
    conditionId: string;
    tokenId: string;
    outcome: string;
    size: number;
    avgPrice: number;
    currentPrice: number | null;
    pnl: number | null;
    realizedPnl: number | null;
    unrealizedPnl: number | null;
    redeemed: boolean;
    market?: {
        conditionId: string;
        question: string;
        slug: string;
        image: string;
        active: boolean;
    } | null;
}

export interface UserPositionsResponse {
    positions: UserPosition[];
    walletAddress: string;
    total: number;
}

// Post Types
export interface Post {
    id: string;
    userId: string;
    content: string | null;
    postType: 'text' | 'position_share';
    marketTicker: string | null;
    side: 'yes' | 'no' | null;
    positionSize: number | null;
    entryPrice: number | null;
    createdAt: string;
    updatedAt: string;
    user?: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
}

export interface CreatePostRequest {
    content?: string;
    postType: 'text' | 'position_share';
    marketTicker?: string;
    side?: 'yes' | 'no';
    positionSize?: number;
    entryPrice?: number;
}

