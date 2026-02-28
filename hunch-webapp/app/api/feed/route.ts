import { NextRequest, NextResponse } from 'next/server';
import { getFollowingIds } from '@/app/lib/followService';
import { getUserTrades, getAllRecentTrades } from '@/app/lib/tradeService';
import redis, { CacheKeys, CacheTTL } from '@/app/lib/redis';

export interface FeedItem {
  id: string;
  userId: string;
  marketTicker: string;
  eventTicker: string | null;
  side: string;
  amount: string;
  transactionSig: string;
  quote: string | null;
  createdAt: Date;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const mode = searchParams.get('mode') || 'following'; // 'following' or 'global'
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');

    // Global feed - return all recent trades (for unauthenticated users or discovery)
    if (mode === 'global' || !userId) {
      const globalCacheKey = 'feed:global';
      
      // Try cache first for global feed
      if (offset === 0) {
        const cached = await redis.get<FeedItem[]>(globalCacheKey);
        if (cached) {
          const response = NextResponse.json(cached.slice(0, limit), { status: 200 });
          response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
          return response;
        }
      }

      // Fetch all recent trades
      const trades = await getAllRecentTrades(limit, offset);
      
      // Cache global feed
      if (offset === 0) {
        await redis.setex(globalCacheKey, CacheTTL.FEED, JSON.stringify(trades));
      }

      const response = NextResponse.json(trades, { status: 200 });
      response.headers.set('Cache-Control', 'public, s-maxage=10, stale-while-revalidate=20');
      return response;
    }

    // Personalized feed - return trades from followed users
    const cacheKey = CacheKeys.feed(userId);
    const cached = await redis.get<FeedItem[]>(cacheKey);
    
    if (cached && offset === 0) {
      // Return cached feed if available and no pagination
      return NextResponse.json(cached.slice(0, limit), { status: 200 });
    }

    // Get list of users being followed
    const followingIds = await getFollowingIds(userId);

    if (followingIds.length === 0) {
      // No one to follow, return empty feed
      const emptyFeed: FeedItem[] = [];
      await redis.setex(cacheKey, CacheTTL.FEED, JSON.stringify(emptyFeed));
      return NextResponse.json(emptyFeed, { status: 200 });
    }

    // Fetch trades from all followed users
    const allTrades: FeedItem[] = [];
    
    // Fetch trades for each followed user (in parallel)
    const tradePromises = followingIds.map((followedUserId) =>
      getUserTrades(followedUserId, 100, 0) // Get more trades per user to aggregate
    );
    
    const tradesArrays = await Promise.all(tradePromises);
    
    // Flatten and sort by createdAt (newest first)
    for (const trades of tradesArrays) {
      allTrades.push(...trades);
    }
    
    // Sort by createdAt descending
    allTrades.sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });

    // Cache the full feed (first page)
    if (offset === 0) {
      await redis.setex(
        cacheKey,
        CacheTTL.FEED,
        JSON.stringify(allTrades.slice(0, limit))
      );
    }

    // Apply pagination
    const paginatedTrades = allTrades.slice(offset, offset + limit);

    return NextResponse.json(paginatedTrades, { status: 200 });
  } catch (error: any) {
    console.error('Error fetching feed:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to fetch feed' },
      { status: 500 }
    );
  }
}
