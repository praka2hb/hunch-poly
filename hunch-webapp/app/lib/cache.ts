import { Redis } from '@upstash/redis';

// Initialize Redis client only on server side and if credentials exist
const redis = (typeof window === 'undefined' && process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    })
  : null;

// Cache TTL constants (in seconds)
export const CACHE_TTL = {
  MARKETS: 15, // 15 seconds for market data
  EVENTS: 30, // 30 seconds for event data
  USER_POSITIONS: 10, // 10 seconds for Solana positions
  MARKET_DETAILS: 20, // 20 seconds for detailed market info
  EVENT_DETAILS: 30, // 30 seconds for event details
  FEED: 10, // 10 seconds for feed data
} as const;

interface CacheOptions {
  ttl?: number;
  forceRefresh?: boolean;
}

/**
 * Generic cache wrapper for async operations
 * Uses Redis for caching with automatic TTL
 */
export async function withCache<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const { ttl = 60, forceRefresh = false } = options;

  // Skip cache if Redis is not configured or we are on client side
  if (!redis) {
    return fetcher();
  }

  try {
    // Force refresh bypasses cache
    if (!forceRefresh) {
      const cached = await redis.get<T>(key);
      if (cached !== null) {
        console.log(`[Cache HIT] ${key}`);
        return cached;
      }
    }

    console.log(`[Cache MISS] ${key}`);
    
    // Fetch fresh data
    const data = await fetcher();
    
    // Cache the result
    await redis.setex(key, ttl, JSON.stringify(data));
    
    return data;
  } catch (error) {
    console.error(`[Cache ERROR] ${key}:`, error);
    // Fallback to fetcher if cache fails
    return fetcher();
  }
}

/**
 * Invalidate cache by key or pattern
 */
export async function invalidateCache(keyOrPattern: string): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    // If pattern contains wildcard, scan and delete matching keys
    if (keyOrPattern.includes('*')) {
      const keys = await redis.keys(keyOrPattern);
      if (keys.length > 0) {
        await redis.del(...keys);
        console.log(`[Cache INVALIDATE] Deleted ${keys.length} keys matching ${keyOrPattern}`);
      }
    } else {
      await redis.del(keyOrPattern);
      console.log(`[Cache INVALIDATE] ${keyOrPattern}`);
    }
  } catch (error) {
    console.error(`[Cache INVALIDATE ERROR] ${keyOrPattern}:`, error);
  }
}

/**
 * Cache key builders for consistency
 */
export const cacheKeys = {
  markets: (limit: number) => `markets:list:${limit}`,
  marketDetails: (ticker: string) => `market:${ticker}`,
  marketsBatch: (tickers: string[]) => `markets:batch:${tickers.sort().join(',')}`,
  events: (limit: number, status?: string) => `events:${status || 'all'}:${limit}`,
  eventDetails: (ticker: string) => `event:${ticker}`,
  userPositions: (walletAddress: string) => `positions:${walletAddress}`,
  outcomeMints: (addresses: string[]) => `outcome-mints:${addresses.length}:${hashAddresses(addresses)}`,
  feed: (mode: string, userId?: string) => `feed:${mode}:${userId || 'global'}`,
};

/**
 * Helper to hash a list of addresses for cache key
 */
function hashAddresses(addresses: string[]): string {
  // Simple hash for cache key - just use first few chars of sorted addresses
  return addresses
    .sort()
    .slice(0, 5)
    .map(a => a.substring(0, 8))
    .join('-');
}

/**
 * Batch cache operations
 */
export async function getCachedBatch<T>(keys: string[]): Promise<Map<string, T>> {
  if (!redis) {
    return new Map();
  }

  try {
    const values = await redis.mget<T[]>(...keys);
    const result = new Map<string, T>();
    
    values.forEach((value, index) => {
      if (value !== null) {
        result.set(keys[index], value);
      }
    });
    
    return result;
  } catch (error) {
    console.error('[Cache MGET ERROR]:', error);
    return new Map();
  }
}

export async function setCachedBatch<T>(
  entries: Map<string, T>,
  ttl: number
): Promise<void> {
  if (!redis) {
    return;
  }

  try {
    const pipeline = redis.pipeline();
    
    for (const [key, value] of entries.entries()) {
      pipeline.setex(key, ttl, JSON.stringify(value));
    }
    
    await pipeline.exec();
  } catch (error) {
    console.error('[Cache MSET ERROR]:', error);
  }
}

/**
 * Memory cache fallback for when Redis is unavailable
 * Used as a secondary in-memory cache layer
 */
class MemoryCache {
  private cache: Map<string, { data: any; expiry: number }> = new Map();
  private maxSize = 100;

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      return null;
    }
    
    return entry.data;
  }

  set(key: string, data: any, ttlSeconds: number): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }
    
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttlSeconds * 1000,
    });
  }

  delete(key: string): void {
    this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }
}

export const memoryCache = new MemoryCache();

