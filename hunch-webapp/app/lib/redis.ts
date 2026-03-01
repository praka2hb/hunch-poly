import { Redis } from '@upstash/redis';

// Initialize Redis client with Upstash configuration
// These environment variables should be set in .env:
// UPSTASH_REDIS_REST_URL
// UPSTASH_REDIS_REST_TOKEN
const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL || '',
  token: process.env.UPSTASH_REDIS_REST_TOKEN || '',
});

export default redis;

// Cache key helpers
export const CacheKeys = {
  user: (userId: string) => `user:${userId}`,
  counts: (userId: string) => `counts:${userId}`,
  follows: (userId: string) => `follows:${userId}`,
  feed: (userId: string) => `feed:${userId}`,
  followers: (userId: string) => `followers:${userId}`,
  following: (userId: string) => `following:${userId}`,
  eventMetadata: (ticker: string) => `event_meta:${ticker}`,
  events: (params: string) => `events:${params}`,
  homeFeed: (params: string) => `home:feed:${params}`,
  homeFeedTrending: (category?: string) => `home:feed:trending:${category ?? 'all'}`,

  // Polymarket Gamma API cache keys
  polyEvents: (params: string) => `poly:events:${params}`,
  polyEvent: (slug: string) => `poly:event:${slug}`,
  polyEventsFeatured: () => `poly:events:featured`,
  polyMarkets: (params: string) => `poly:markets:${params}`,
  polyMarketsTop: () => `poly:markets:top`,
  polyMarket: (conditionId: string) => `poly:market:${conditionId}`,
  polyPriceHistory: (tokenId: string, params: string) => `poly:prices:${tokenId}:${params}`,
  polyTags: () => `poly:tags`,
};

// Cache TTL constants (in seconds)
export const CacheTTL = {
  FEED: 45, // 45 seconds for social feed
  USER: 300, // 5 minutes for user profiles
  COUNTS: 600, // 10 minutes for counts
  FOLLOWS: 600, // 10 minutes for follow relationships
  EVENT_METADATA: 86400, // 24 hours for event metadata (rarely changes)
  EVENTS_LIST: 60, // 1 minute for events list (with metadata)

  // Polymarket TTLs
  POLY_EVENTS: 30,       // 30 seconds for events list
  POLY_EVENTS_FEATURED: 60, // 60 seconds for featured events
  POLY_MARKET: 30,       // 30 seconds for market data
  POLY_MARKETS_TOP: 60,  // 60 seconds for top markets
  POLY_PRICES: 120,      // 2 minutes for price history
  POLY_TAGS: 600,        // 10 minutes for tags
};


