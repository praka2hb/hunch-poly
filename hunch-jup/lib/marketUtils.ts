import { CandleData, Event, Market } from './types';

/**
 * Format a decimal probability value to a percentage string
 * @param value - Decimal value (e.g., 0.65)
 * @returns Formatted percentage (e.g., "65%")
 */
export const formatPercent = (value: string | number | undefined | null): string => {
    if (value === undefined || value === null) return '—';

    const numValue = typeof value === 'string' ? parseFloat(value) : value;
    if (isNaN(numValue)) return '—';

    return `${Math.round(numValue * 100)}%`;
};

/**
 * Format large volume numbers to condensed notation
 * @param value - Volume value (e.g., 123456)
 * @returns Formatted string (e.g., "$123K")
 */
export const formatVolume = (value: number | undefined | null): string => {
    if (value === undefined || value === null || value === 0) return '—';

    if (value >= 1000000) {
        return `$${(value / 1000000).toFixed(1)}M`;
    } else if (value >= 1000) {
        return `$${(value / 1000).toFixed(1)}K`;
    }

    return `$${value.toFixed(0)}`;
};

/**
 * Calculate potential return for a given investment amount
 * @param price - Market price (yesBid or noBid)
 * @param investment - Investment amount (default: 100)
 * @returns Potential return amount or null if invalid
 */
export const calculateReturn = (
    price: string | undefined | null,
    investment: number = 100
): number | null => {
    if (!price) return null;

    const priceNum = parseFloat(price);
    if (priceNum <= 0 || isNaN(priceNum)) return null;

    return investment / priceNum;
};

/**
 * Filter out inactive markets (finalized, resolved, closed)
 * @param markets - Array of markets
 * @returns Array of active markets
 */
export const getActiveMarkets = (markets: Market[] | undefined): Market[] => {
    if (!markets) return [];

    return markets.filter(
        (market) =>
            market.status !== 'finalized' &&
            market.status !== 'resolved' &&
            market.status !== 'closed'
    );
};

/**
 * Get top N markets sorted by highest probability (yesBid)
 * @param markets - Array of markets
 * @param count - Number of top markets to return (default: 2)
 * @param excludeHighProb - Exclude markets with probability > 0.95 (default: false)
 * @returns Top N markets sorted by probability
 */
export const getTopMarkets = (
    markets: Market[] | undefined,
    count: number = 2,
    excludeHighProb: boolean = false
): Market[] => {
    if (!markets) return [];

    // Filter active markets
    let activeMarkets = getActiveMarkets(markets);

    // Optionally exclude very high probability markets
    if (excludeHighProb) {
        activeMarkets = activeMarkets.filter((market) => {
            const yesProb = parseFloat(market.yesBid || '0');
            const noProb = parseFloat(market.noBid || '0');
            return yesProb < 0.95 && noProb < 0.95;
        });
    }

    // Sort by yesBid (highest first)
    const sorted = activeMarkets.sort((a, b) => {
        const aChance = parseFloat(a.yesBid || '0');
        const bChance = parseFloat(b.yesBid || '0');
        return bChance - aChance;
    });

    return sorted.slice(0, count);
};

/**
 * Get the best market title to display
 * Prioritizes yesSubTitle > title
 * @param market - Market object
 * @returns Display title
 */
export const getMarketDisplayTitle = (market: Market): string => {
    return market.yesSubTitle || market.title || 'Untitled Market';
};

/** Patterns that indicate a numeric-outcome market (e.g. "Bitcoin hitting $X", "How many launches") */
const NUMERIC_OUTCOME_PATTERNS = [
    /\bhitting\b/i,
    /\bhit\s+\$?[\d,]/i,
    /\bhow\s+many\b/i,
    /\bnumber\s+of\b/i,
    /\bat\s+least\b/i,
    /\bat\s+most\b/i,
    /\babove\s+\$?[\d,]/i,
    /\bbelow\s+\$?[\d,]/i,
    /\bover\s+\$?[\d,]/i,
    /\bunder\s+\$?[\d,]/i,
    /\breach(es)?\s+\$?[\d,]/i,
    /\bexceed(s)?\s+\$?[\d,]/i,
    /\$[\d,]+(k|m|bn)?\s+(before|by)/i,
    /[\d,]+(k|m|bn)?\s+(before|by)/i,
    /\b(before|by)\s+[\d\/]/i,
    /\b(before|by)\s+[A-Z][a-z]{2,}/i,
];

/**
 * Heuristic: true if the market is about numeric outcomes (prices, counts, targets)
 * e.g. "Bitcoin hitting $100k before 2025", "How many SpaceX launches before..."
 */
export const isNumericOutcomeMarket = (market: Market): boolean => {
    const t = (market.yesSubTitle || market.title || '').toLowerCase();
    return NUMERIC_OUTCOME_PATTERNS.some((p) => p.test(t));
};

/**
 * Calculate event score for market rail ranking
 * Combines volume metrics and time-to-close urgency
 * @param event - Event object
 * @returns Score value (higher = more prominent)
 */
export const calculateEventScore = (event: Event): number => {
    // Volume score: use the highest available volume metric
    const volumeScore = event.volume ?? event.volume24h ?? event.openInterest ?? 0;

    // Time score: events closing sooner get higher priority
    const now = Date.now();
    const closeTime = event.closeTime ? event.closeTime * 1000 : null;

    let timeScore = 0;
    if (closeTime && closeTime > now) {
        const timeToClose = closeTime - now;
        // Inverse relationship: sooner = higher score
        timeScore = 1000000 / timeToClose;
    }

    return volumeScore + timeScore;
};

/**
 * Get events scored and sorted for market rail display
 * @param events - Array of events
 * @param limit - Max number of events to return (default: 7)
 * @returns Top events with their top market and scores
 */
export const getScoredEventsForRail = (
    events: Event[],
    limit: number = 7
): Array<{ event: Event; market: Market; score: number }> => {
    const scoredEvents = events
        .map((event) => {
            // Need at least one active market
            const topMarkets = getTopMarkets(event.markets, 1, true);
            if (topMarkets.length === 0) return null;

            const score = calculateEventScore(event);

            return {
                event,
                market: topMarkets[0],
                score,
            };
        })
        .filter((item): item is { event: Event; market: Market; score: number } => item !== null)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);

    return scoredEvents;
};

/**
 * Convert Yes-side candles into No-side candles (No = 1 - Yes).
 * High/low are swapped after inversion to preserve OHLC ordering.
 */
export const invertCandlesForNoSide = (candles: CandleData[] = []): CandleData[] => {
    if (!candles.length) return candles;
    return candles.map((candle) => ({
        ...candle,
        open: 1 - candle.open,
        high: 1 - candle.low,
        low: 1 - candle.high,
        close: 1 - candle.close,
    }));
};
