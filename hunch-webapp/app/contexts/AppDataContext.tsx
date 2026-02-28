'use client';

import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { Market } from '../lib/api';
import {
  getCachedUserId,
  getCachedUserCounts,
  getCachedUserProfile,
  syncUserOnLogin,
  needsSync,
  updateCachedCounts,
  cacheUserData,
  UserCounts,
  CachedUserProfile,
} from '../lib/authSync';
import { normalizeTwitterAvatarUrl } from '@/lib/utils';

interface MarketCacheEntry {
  data: Market;
  timestamp: number;
}

interface AppDataContextType {
  // User state
  currentUserId: string | null;
  userProfile: CachedUserProfile | null;
  userCounts: UserCounts | null;
  isUserLoading: boolean;

  // Market cache
  getMarket: (ticker: string) => Market | null;
  getMarkets: (tickers: string[]) => Map<string, Market>;
  cacheMarket: (market: Market) => void;
  cacheMarkets: (markets: Market[]) => void;

  // User operations
  refreshUser: (force?: boolean) => Promise<void>;
  updateUserCounts: (counts: Partial<UserCounts>) => void;
  invalidateUser: () => void;

  // Request deduplication
  dedupedFetch: <T>(key: string, fetcher: () => Promise<T>, ttl?: number) => Promise<T>;

  // Positions refresh (for trade/sell operations)
  positionsRefreshKey: number;
  triggerPositionsRefresh: () => void;
}

const AppDataContext = createContext<AppDataContextType | undefined>(undefined);

const MARKET_CACHE_TTL = 15000; // 15 seconds
const REQUEST_CACHE_TTL = 5000; // 5 seconds for request deduplication

interface InFlightRequest<T> {
  promise: Promise<T>;
  timestamp: number;
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const { ready, authenticated, user } = usePrivy();

  // User state
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<CachedUserProfile | null>(null);
  const [userCounts, setUserCounts] = useState<UserCounts | null>(null);

  // Positions refresh key - increment to trigger position reloads across the app
  const [positionsRefreshKey, setPositionsRefreshKey] = useState(0);
  const [isUserLoading, setIsUserLoading] = useState(false);

  // Market cache (ticker -> market data with timestamp)
  const marketCache = useRef<Map<string, MarketCacheEntry>>(new Map());

  // Request deduplication cache
  const inFlightRequests = useRef<Map<string, InFlightRequest<any>>>(new Map());

  // Sync tracking
  const hasSyncedRef = useRef(false);
  const syncInProgressRef = useRef(false);

  // Get wallet address
  const getWalletAddress = useCallback(() => {
    if (!user?.linkedAccounts) return null;

    const walletAccount = user.linkedAccounts.find(
      (account) =>
        account.type === 'wallet' &&
        'address' in account &&
        account.address &&
        typeof account.address === 'string' &&
        !account.address.startsWith('0x') &&
        account.address.length >= 32
    ) as any;

    return walletAccount?.address as string | undefined || null;
  }, [user]);

  // Initialize from localStorage cache immediately
  useEffect(() => {
    const cachedUserId = getCachedUserId();
    const cachedCounts = getCachedUserCounts();
    const cachedProfile = getCachedUserProfile();

    if (cachedUserId) setCurrentUserId(cachedUserId);
    if (cachedCounts) setUserCounts(cachedCounts);
    if (cachedProfile) setUserProfile(cachedProfile);
  }, []);

  // Main user sync logic
  const refreshUser = useCallback(async (force: boolean = false) => {
    if (!ready || !authenticated || !user) {
      setCurrentUserId(null);
      setUserProfile(null);
      setUserCounts(null);
      hasSyncedRef.current = false;
      return;
    }

    const walletAddress = getWalletAddress();
    if (!walletAddress) return;

    // Prevent duplicate syncs
    if (syncInProgressRef.current) return;

    // Check if sync is needed
    if (!force && !needsSync(user.id) && hasSyncedRef.current) {
      return;
    }

    syncInProgressRef.current = true;
    setIsUserLoading(true);

    try {
      const normalizedAvatarUrl = normalizeTwitterAvatarUrl(user.twitter?.profilePictureUrl);
      const result = await syncUserOnLogin(
        user.id,
        walletAddress,
        user.twitter?.username ? `@${user.twitter.username}` : user.google?.email?.split('@')[0] || null,
        normalizedAvatarUrl
      );

      if (result) {
        setCurrentUserId(result.userId);
        setUserCounts(result.counts);

        const profile: CachedUserProfile = {
          id: result.userId,
          displayName: user.twitter?.username ? `@${user.twitter.username}` : user.google?.email?.split('@')[0] || null,
          avatarUrl: normalizedAvatarUrl,
          walletAddress,
          followerCount: result.counts.followerCount,
          followingCount: result.counts.followingCount,
        };
        setUserProfile(profile);
        hasSyncedRef.current = true;
      }
    } catch (error) {
      console.error('Error syncing user:', error);
    } finally {
      syncInProgressRef.current = false;
      setIsUserLoading(false);
    }
  }, [ready, authenticated, user, getWalletAddress]);

  // Auto-sync on auth state change
  useEffect(() => {
    if (ready && authenticated && user) {
      refreshUser();
    } else if (ready && !authenticated) {
      setCurrentUserId(null);
      setUserProfile(null);
      setUserCounts(null);
      hasSyncedRef.current = false;
    }
  }, [ready, authenticated, user, refreshUser]);

  // Update user counts (optimistic updates)
  const updateUserCounts = useCallback((counts: Partial<UserCounts>) => {
    setUserCounts(prev => {
      if (!prev) return null;
      const updated = { ...prev, ...counts };
      updateCachedCounts(updated);
      return updated;
    });

    setUserProfile(prev => {
      if (!prev) return null;
      return {
        ...prev,
        followerCount: counts.followerCount ?? prev.followerCount,
        followingCount: counts.followingCount ?? prev.followingCount,
      };
    });
  }, []);

  // Invalidate user data
  const invalidateUser = useCallback(() => {
    hasSyncedRef.current = false;
    refreshUser(true);
  }, [refreshUser]);

  // Trigger positions refresh across the app (call after trade/sell success)
  const triggerPositionsRefresh = useCallback(() => {
    setPositionsRefreshKey(prev => prev + 1);
  }, []);

  // Market cache operations
  const getMarket = useCallback((ticker: string): Market | null => {
    const entry = marketCache.current.get(ticker);
    if (!entry) return null;

    // Check if expired
    if (Date.now() - entry.timestamp > MARKET_CACHE_TTL) {
      marketCache.current.delete(ticker);
      return null;
    }

    return entry.data;
  }, []);

  const getMarkets = useCallback((tickers: string[]): Map<string, Market> => {
    const result = new Map<string, Market>();
    const now = Date.now();

    for (const ticker of tickers) {
      const entry = marketCache.current.get(ticker);
      if (entry && now - entry.timestamp <= MARKET_CACHE_TTL) {
        result.set(ticker, entry.data);
      }
    }

    return result;
  }, []);

  const cacheMarket = useCallback((market: Market) => {
    marketCache.current.set(market.ticker, {
      data: market,
      timestamp: Date.now(),
    });
  }, []);

  const cacheMarkets = useCallback((markets: Market[]) => {
    const now = Date.now();
    markets.forEach(market => {
      marketCache.current.set(market.ticker, {
        data: market,
        timestamp: now,
      });
    });
  }, []);

  // Request deduplication
  const dedupedFetch = useCallback(async <T,>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = REQUEST_CACHE_TTL
  ): Promise<T> => {
    const now = Date.now();
    const existing = inFlightRequests.current.get(key);

    // Return existing request if still fresh
    if (existing && now - existing.timestamp < ttl) {
      return existing.promise;
    }

    // Create new request
    const promise = fetcher();
    inFlightRequests.current.set(key, { promise, timestamp: now });

    // Clean up after completion
    promise.finally(() => {
      setTimeout(() => {
        inFlightRequests.current.delete(key);
      }, ttl);
    });

    return promise;
  }, []);

  // Periodic cache cleanup
  useEffect(() => {
    const cleanup = setInterval(() => {
      const now = Date.now();

      // Clean expired market cache entries
      for (const [ticker, entry] of marketCache.current.entries()) {
        if (now - entry.timestamp > MARKET_CACHE_TTL) {
          marketCache.current.delete(ticker);
        }
      }

      // Clean expired in-flight requests
      for (const [key, request] of inFlightRequests.current.entries()) {
        if (now - request.timestamp > REQUEST_CACHE_TTL * 2) {
          inFlightRequests.current.delete(key);
        }
      }
    }, 30000); // Clean every 30 seconds

    return () => clearInterval(cleanup);
  }, []);

  const value: AppDataContextType = {
    currentUserId,
    userProfile,
    userCounts,
    isUserLoading,
    getMarket,
    getMarkets,
    cacheMarket,
    cacheMarkets,
    refreshUser,
    updateUserCounts,
    invalidateUser,
    dedupedFetch,
    positionsRefreshKey,
    triggerPositionsRefresh,
  };

  return (
    <AppDataContext.Provider value={value}>
      {children}
    </AppDataContext.Provider>
  );
}

export function useAppData() {
  const context = useContext(AppDataContext);
  if (context === undefined) {
    throw new Error('useAppData must be used within an AppDataProvider');
  }
  return context;
}

