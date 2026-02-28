import 'server-only';
import type { Event, Market } from './dflowServer';

// ============ TYPES ============

export interface ProcessedHomeFeed {
    events: Event[];
    topMarkets: MarketWithEvent[];
    metadata: {
        totalEvents: number;
        hasMore: boolean;
    };
}

export interface MarketWithEvent extends Market {
    eventTicker: string;
}

export interface ProcessOptions {
    category?: string;
    limit?: number;
    includeMarkets?: boolean;
}

// ============ CONSTANTS ============

const FALLBACK_IMAGE_PATTERN = /kalshi-fallback-images/i;

// ============ HELPER FUNCTIONS ============

/**
 * Check if a market has at least one active status
 */
function isActiveMarket(market: Market): boolean {
    return market.status === 'active';
}

/**
 * Check if an image URL is valid for display
 * @param imageUrl - The image URL to validate
 * @param strictMode - If true (Hot category), require valid HTTP URL
 */
function isValidImageUrl(imageUrl: string | undefined | null, strictMode: boolean): boolean {
    if (!imageUrl) {
        // In strict mode (Hot), missing images are invalid
        // In non-strict mode, missing images are acceptable
        return !strictMode;
    }

    // Always exclude fallback images
    if (FALLBACK_IMAGE_PATTERN.test(imageUrl)) {
        return false;
    }

    // In strict mode, require HTTP/HTTPS URL
    if (strictMode) {
        return imageUrl.startsWith('http://') || imageUrl.startsWith('https://');
    }

    return true;
}

/**
 * Get the image URL from a market (handles different field names)
 */
function getMarketImageUrl(market: Market): string | undefined {
    return market.image_url ?? (market as any).imageUrl;
}

// ============ CORE PROCESSING FUNCTIONS ============

/**
 * Filter events to only include those with at least one active market
 */
export function filterActiveEvents(events: Event[]): Event[] {
    return events.filter(event => {
        const markets = event.markets || [];
        return markets.some(isActiveMarket);
    });
}

/**
 * Sort events by volume in descending order
 */
export function sortEventsByVolume(events: Event[]): Event[] {
    return [...events].sort((a, b) => {
        const volumeA = a.volume ?? 0;
        const volumeB = b.volume ?? 0;
        return volumeB - volumeA;
    });
}

/**
 * Extract the top market by volume from an event
 * Applies image filtering based on category
 */
export function extractTopMarket(
    event: Event,
    category?: string
): MarketWithEvent | null {
    const markets = event.markets || [];
    const isHotCategory = category === 'Hot';

    // Filter to active markets only
    const activeMarkets = markets.filter(isActiveMarket);

    if (activeMarkets.length === 0) {
        return null;
    }

    // Filter by image quality
    const validMarkets = activeMarkets.filter(market => {
        const imageUrl = getMarketImageUrl(market);
        return isValidImageUrl(imageUrl, isHotCategory);
    });

    // If no valid markets after image filtering, return null for Hot category
    // For other categories, fall back to any active market
    const marketsToConsider = validMarkets.length > 0 ? validMarkets : (isHotCategory ? [] : activeMarkets);

    if (marketsToConsider.length === 0) {
        return null;
    }

    // Sort by volume and take the top one
    const topMarket = marketsToConsider.reduce((best, current) => {
        const bestVolume = best.volume ?? 0;
        const currentVolume = current.volume ?? 0;
        return currentVolume > bestVolume ? current : best;
    }, marketsToConsider[0]);

    return {
        ...topMarket,
        eventTicker: event.ticker,
    };
}

/**
 * Build the topMarkets array from processed events
 * Returns one market per event, sorted by volume
 */
export function buildTopMarketsArray(
    events: Event[],
    category?: string
): MarketWithEvent[] {
    const topMarkets: MarketWithEvent[] = [];

    for (const event of events) {
        const topMarket = extractTopMarket(event, category);
        if (topMarket) {
            topMarkets.push(topMarket);
        }
    }

    // Sort by market volume descending
    return topMarkets.sort((a, b) => {
        const volumeA = a.volume ?? 0;
        const volumeB = b.volume ?? 0;
        return volumeB - volumeA;
    });
}

/**
 * Filter events for Hot category - must have a market with valid image
 */
function filterEventsWithValidImages(events: Event[], category?: string): Event[] {
    if (category !== 'Hot') {
        return events;
    }

    return events.filter(event => {
        const markets = event.markets || [];
        return markets.some(market => {
            if (!isActiveMarket(market)) return false;
            const imageUrl = getMarketImageUrl(market);
            return isValidImageUrl(imageUrl, true);
        });
    });
}

// ============ MAIN PROCESSING FUNCTION ============

/**
 * Process home feed events with filtering, sorting, and market extraction
 */
export function processHomeFeed(
    events: Event[],
    options: ProcessOptions = {}
): ProcessedHomeFeed {
    const { category, limit, includeMarkets = true } = options;

    // Step 1: Filter to events with active markets
    let processedEvents = filterActiveEvents(events);

    // Step 2: For Hot category, filter to events with valid images
    processedEvents = filterEventsWithValidImages(processedEvents, category);

    const totalEvents = processedEvents.length;

    // Step 3: Sort by volume
    processedEvents = sortEventsByVolume(processedEvents);

    // Step 4: Apply limit if specified
    const hasMore = limit ? processedEvents.length > limit : false;
    if (limit) {
        processedEvents = processedEvents.slice(0, limit);
    }

    // Step 5: Build top markets array if requested
    const topMarkets = includeMarkets
        ? buildTopMarketsArray(processedEvents, category)
        : [];

    return {
        events: processedEvents,
        topMarkets,
        metadata: {
            totalEvents,
            hasMore,
        },
    };
}
