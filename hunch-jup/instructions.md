# Social Feed API Context & Implementation Guide

This document provides comprehensive context about the backend API for the social feed screen (`/social`) and how the mobile app should handle it.

## Overview

The social feed displays trading activity from users. It supports two modes:
- **Global Feed**: Shows all recent trades (for unauthenticated users or discovery)
- **Following Feed**: Shows trades from users you follow (for authenticated users)

---

## Core API Endpoint

### `GET /api/feed`

Returns a list of trade feed items sorted by most recent (newest first).

#### Query Parameters

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `userId` | string | No | - | User ID for personalized feed (required for `following` mode) |
| `mode` | `'following' \| 'global'` | No | `'following'` | Feed mode: `'following'` for personalized, `'global'` for all trades |
| `limit` | number | No | `50` | Number of items to return |
| `offset` | number | No | `0` | Pagination offset |

#### Request Examples

**Global Feed (unauthenticated or discovery):**
```http
GET /api/feed?mode=global&limit=50&offset=0
```

**Following Feed (authenticated user):**
```http
GET /api/feed?userId=USER_ID&mode=following&limit=50&offset=0
```

#### Response Format

```typescript
interface FeedItem {
  id: string;                    // Trade ID
  userId: string;                // User who made the trade
  marketTicker: string;          // Market ticker (e.g., "BTC-2024-12-31")
  eventTicker: string | null;    // Event ticker (optional)
  side: 'yes' | 'no';            // Trade side
  amount: string;                 // Trade amount (as string for precision)
  transactionSig: string;        // Solana transaction signature
  quote: string | null;           // Optional quote/comment (max 280 chars)
  createdAt: string;              // ISO date string
  user: {
    id: string;
    displayName: string | null;   // User's display name
    avatarUrl: string | null;     // User's avatar URL
    walletAddress: string;        // User's wallet address
  };
}
```

#### Response Example

```json
[
  {
    "id": "trade_123",
    "userId": "user_456",
    "marketTicker": "BTC-2024-12-31",
    "eventTicker": "BTC-PRICE-2024",
    "side": "yes",
    "amount": "100.5",
    "transactionSig": "5KJp...",
    "quote": "Bitcoin to the moon! 🚀",
    "createdAt": "2024-01-15T10:30:00Z",
    "user": {
      "id": "user_456",
      "displayName": "CryptoTrader",
      "avatarUrl": "https://...",
      "walletAddress": "7xKX..."
    }
  }
]
```

#### Response Headers

- `Cache-Control: public, s-maxage=10, stale-while-revalidate=20` (for global feed)

---

## How the Feed Works

### Global Feed Mode (`mode=global`)

1. **When to use**: 
   - User is not authenticated
   - User wants to discover new traders
   - User has no followers yet

2. **Behavior**:
   - Returns all recent trades from all users
   - Sorted by `createdAt` descending (newest first)
   - Cached for 10 seconds (Redis)
   - Publicly accessible

3. **Implementation**:
   ```typescript
   // Backend logic (simplified)
   if (mode === 'global' || !userId) {
     const trades = await getAllRecentTrades(limit, offset);
     return trades; // Already sorted by createdAt DESC
   }
   ```

### Following Feed Mode (`mode=following`)

1. **When to use**:
   - User is authenticated
   - User has followed at least one person

2. **Behavior**:
   - Fetches trades from all users the current user follows
   - Aggregates trades from multiple followed users
   - Sorts by `createdAt` descending (newest first)
   - Cached per user (Redis)
   - Returns empty array if user follows no one

3. **Implementation**:
   ```typescript
   // Backend logic (simplified)
   const followingIds = await getFollowingIds(userId);
   if (followingIds.length === 0) {
     return []; // Empty feed
   }
   
   // Fetch trades from all followed users (in parallel)
   const tradePromises = followingIds.map(id => 
     getUserTrades(id, 100, 0)
   );
   const tradesArrays = await Promise.all(tradePromises);
   
   // Flatten and sort
   const allTrades = tradesArrays.flat();
   allTrades.sort((a, b) => 
     new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
   );
   
   return allTrades.slice(offset, offset + limit);
   ```

---

## Related APIs

### User Search

**Endpoint**: `GET /api/users/search`

Search for users to follow.

**Query Parameters**:
- `q` (string): Search query (name or wallet address)
- `type` (optional): Filter type

**Response**:
```typescript
interface SearchResult {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  walletAddress: string;
  _count?: {
    trades: number;
    followers: number;
    following: number;
  };
}
```

### Follow/Unfollow

**Follow User**:
```http
POST /api/follow
Content-Type: application/json

{
  "followerId": "user_123",
  "followingId": "user_456"
}
```

**Unfollow User**:
```http
DELETE /api/follow
Content-Type: application/json

{
  "followerId": "user_123",
  "followingId": "user_456"
}
```

**Get Following List**:
```http
GET /api/follow/following?userId=USER_ID
```

**Get Followers List**:
```http
GET /api/follow/followers?userId=USER_ID
```

### Market/Event Details

To display full market information for each feed item, you'll need to fetch additional data:

**Get Market Details**:
```http
GET /api/dflow/market/[ticker]
```

**Get Event Details**:
```http
GET /api/dflow/event/[ticker]
```

**Batch Get Markets** (for efficiency):
```http
POST /api/markets/batch
Content-Type: application/json

{
  "tickers": ["BTC-2024-12-31", "ETH-2024-12-31"]
}
```

---

## Mobile App Implementation Guide

### 1. Feed Screen Structure

```typescript
// Feed Screen Component Structure
interface FeedScreenState {
  feedItems: FeedItem[];
  loading: boolean;
  error: string | null;
  mode: 'following' | 'global';
  hasMore: boolean;
  offset: number;
}
```

### 2. Fetching Feed Data

```typescript
// Example implementation
const loadFeed = async (
  userId?: string,
  mode: 'following' | 'global' = 'global',
  limit: number = 50,
  offset: number = 0
) => {
  try {
    setLoading(true);
    setError(null);
    
    const params = new URLSearchParams({
      limit: limit.toString(),
      offset: offset.toString(),
      mode,
    });
    
    if (userId && mode === 'following') {
      params.append('userId', userId);
    }
    
    const response = await fetch(`${API_BASE_URL}/api/feed?${params}`);
    
    if (!response.ok) {
      throw new Error('Failed to load feed');
    }
    
    const data: FeedItem[] = await response.json();
    
    // Feed is already sorted by newest first
    if (offset === 0) {
      setFeedItems(data);
    } else {
      setFeedItems(prev => [...prev, ...data]);
    }
    
    setHasMore(data.length === limit);
    setOffset(offset + data.length);
  } catch (err) {
    setError(err.message || 'Failed to load feed');
  } finally {
    setLoading(false);
  }
};
```

### 3. Handling Authentication State

```typescript
// Determine feed mode based on auth state
useEffect(() => {
  if (authenticated && userId) {
    // User is logged in - try following feed first
    loadFeed(userId, 'following', 50, 0);
  } else {
    // User not logged in - show global feed
    loadFeed(undefined, 'global', 50, 0);
  }
}, [authenticated, userId]);
```

### 4. Pull-to-Refresh

```typescript
const onRefresh = useCallback(() => {
  setOffset(0);
  loadFeed(userId, mode, 50, 0);
}, [userId, mode]);
```

### 5. Infinite Scroll / Pagination

```typescript
const loadMore = useCallback(() => {
  if (!loading && hasMore) {
    loadFeed(userId, mode, 50, offset);
  }
}, [userId, mode, loading, hasMore, offset]);
```

### 6. Displaying Feed Items

Each feed item should display:
- **User info**: Avatar, display name (or wallet address if no name)
- **Trade action**: "Bought YES" or "Sold NO" on [Market Name]
- **Amount**: Trade amount
- **Quote**: Optional comment/quote (if present)
- **Timestamp**: Relative time (e.g., "2h ago")
- **Market details**: Link to market/event page

### 7. Empty States

**No Trades (Global Feed)**:
- Show message: "No trades yet. Be the first to trade!"

**No Following (Following Feed)**:
- Show message: "You're not following anyone yet."
- Show "Discover Traders" button linking to user search

**No Trades from Following**:
- Show message: "No recent trades from people you follow."
- Option to switch to global feed

### 8. Error Handling

```typescript
// Handle different error scenarios
if (error) {
  if (error.includes('Failed to load feed')) {
    // Network error - show retry button
  } else if (error.includes('401') || error.includes('403')) {
    // Auth error - redirect to login
  } else {
    // Generic error - show error message
  }
}
```

### 9. Caching Strategy

- **Cache feed data locally** (e.g., AsyncStorage) for offline viewing
- **Refresh on app foreground** if data is stale (> 10 seconds)
- **Use React Query or SWR** for automatic caching and refetching

### 10. Performance Optimizations

1. **Batch market data fetching**: Instead of fetching market details for each item individually, collect all unique `marketTicker` values and batch fetch them.

```typescript
// Collect unique market tickers
const marketTickers = Array.from(
  new Set(feedItems.map(item => item.marketTicker))
);

// Batch fetch market details
const marketsResponse = await fetch(`${API_BASE_URL}/api/markets/batch`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ tickers: marketTickers }),
});

const marketsMap = await marketsResponse.json();
```

2. **Virtualized lists**: Use `FlatList` (React Native) or `VirtualizedList` for efficient rendering of long feeds.

3. **Image optimization**: Lazy load user avatars and use placeholder images.

---

## Data Flow Diagram

```
┌─────────────────┐
│  Mobile App     │
│  /social screen │
└────────┬────────┘
         │
         │ 1. GET /api/feed?mode=global&limit=50
         │    OR
         │    GET /api/feed?userId=xxx&mode=following&limit=50
         ▼
┌─────────────────┐
│  Feed API       │
│  /api/feed      │
└────────┬────────┘
         │
         ├─► Global Mode: getAllRecentTrades()
         │   └─► Returns all trades sorted by createdAt DESC
         │
         └─► Following Mode: 
             ├─► getFollowingIds(userId)
             ├─► getUserTrades() for each followed user (parallel)
             └─► Aggregate & sort by createdAt DESC
         │
         ▼
┌─────────────────┐
│  Redis Cache    │
│  (10s TTL)      │
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  Database       │
│  (Prisma)       │
└─────────────────┘
```

---

## Key Implementation Notes

1. **Feed is pre-sorted**: The API returns items sorted by `createdAt` descending (newest first). No need to sort on the client.

2. **Pagination**: Use `offset` and `limit` for pagination. The API supports standard offset-based pagination.

3. **Caching**: Global feed is cached for 10 seconds. Following feed is cached per user. Consider this when implementing refresh logic.

4. **Empty feeds**: If a user follows no one, the following feed returns an empty array `[]`, not an error.

5. **Mode switching**: Users should be able to toggle between "Following" and "Global" feeds. Update the `mode` parameter accordingly.

6. **Real-time updates**: The feed doesn't support real-time updates (WebSocket). Implement pull-to-refresh or periodic polling for new content.

7. **Market data**: Feed items only include `marketTicker` and `eventTicker`. You'll need to fetch full market/event details separately if needed for display.

---

## Example Mobile App Flow

```typescript
// Complete example for React Native / Expo

import { useState, useEffect, useCallback } from 'react';
import { FlatList, RefreshControl } from 'react-native';

const API_BASE_URL = 'https://your-api-domain.com'; // or local IP for dev

interface FeedItem {
  id: string;
  userId: string;
  marketTicker: string;
  eventTicker: string | null;
  side: 'yes' | 'no';
  amount: string;
  transactionSig: string;
  quote: string | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
}

export default function SocialFeedScreen() {
  const { userId, authenticated } = useAuth(); // Your auth hook
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'following' | 'global'>('global');
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const loadFeed = useCallback(async (
    reset: boolean = false
  ) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      }
      setError(null);

      const currentOffset = reset ? 0 : offset;
      const params = new URLSearchParams({
        limit: '50',
        offset: currentOffset.toString(),
        mode,
      });

      if (authenticated && userId && mode === 'following') {
        params.append('userId', userId);
      }

      const response = await fetch(`${API_BASE_URL}/api/feed?${params}`);

      if (!response.ok) {
        throw new Error('Failed to load feed');
      }

      const data: FeedItem[] = await response.json();

      if (reset) {
        setFeedItems(data);
      } else {
        setFeedItems(prev => [...prev, ...data]);
      }

      setHasMore(data.length === 50);
      setOffset(currentOffset + data.length);
    } catch (err: any) {
      setError(err.message || 'Failed to load feed');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, authenticated, mode, offset]);

  useEffect(() => {
    // Determine initial mode
    if (authenticated && userId) {
      setMode('following');
    } else {
      setMode('global');
    }
  }, [authenticated, userId]);

  useEffect(() => {
    if (mode) {
      loadFeed(true);
    }
  }, [mode]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadFeed(true);
  }, [loadFeed]);

  const onEndReached = useCallback(() => {
    if (!loading && hasMore && !refreshing) {
      loadFeed(false);
    }
  }, [loading, hasMore, refreshing, loadFeed]);

  const renderFeedItem = ({ item }: { item: FeedItem }) => {
    return (
      <FeedItemCard
        trade={item}
        onPress={() => {
          // Navigate to market/event detail
          router.push(`/market/${item.marketTicker}`);
        }}
      />
    );
  };

  if (loading && feedItems.length === 0) {
    return <LoadingSpinner />;
  }

  if (error && feedItems.length === 0) {
    return <ErrorView error={error} onRetry={() => loadFeed(true)} />;
  }

  return (
    <View style={styles.container}>
      {/* Mode Toggle */}
      {authenticated && (
        <View style={styles.modeToggle}>
          <Button
            title="Following"
            onPress={() => setMode('following')}
            active={mode === 'following'}
          />
          <Button
            title="Global"
            onPress={() => setMode('global')}
            active={mode === 'global'}
          />
        </View>
      )}

      {/* Feed List */}
      <FlatList
        data={feedItems}
        renderItem={renderFeedItem}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        ListEmptyComponent={
          <EmptyState
            mode={mode}
            authenticated={authenticated}
            onDiscover={() => router.push('/users/search')}
          />
        }
        ListFooterComponent={
          loading && feedItems.length > 0 ? <LoadingSpinner /> : null
        }
      />
    </View>
  );
}
```

---

## Testing Checklist

- [ ] Global feed loads for unauthenticated users
- [ ] Following feed loads for authenticated users
- [ ] Empty state shows when user follows no one
- [ ] Pull-to-refresh works correctly
- [ ] Infinite scroll/pagination works
- [ ] Mode switching (Following ↔ Global) works
- [ ] Error handling displays appropriate messages
- [ ] Feed items display correctly (user info, trade details, timestamp)
- [ ] Market/event navigation works from feed items
- [ ] Performance is acceptable with 50+ items

---

## Additional Resources

- **API Summary**: See `API_SUMMARY.md` for all available endpoints
- **API Reference**: See `md/API_REFERENCE.md` for detailed endpoint documentation
- **Web Implementation**: See `app/components/SocialFeed.tsx` for reference web implementation
- **Trade Service**: See `app/lib/tradeService.ts` for trade-related functions
- **Follow Service**: See `app/lib/followService.ts` for follow-related functions

---

## Questions or Issues?

If you encounter issues or need clarification:
1. Check the API response format matches the `FeedItem` interface
2. Verify authentication state is correctly passed
3. Ensure `mode` parameter is set correctly based on user state
4. Check network requests in dev tools/logs
5. Verify Redis cache isn't causing stale data (clear cache if needed)

