# Expo App Setup Guide

Complete guide to set up the backend and Expo frontend for the Hunch prediction markets app.

## Table of Contents
1. [Backend Setup](#backend-setup)
2. [Expo Frontend Setup](#expo-frontend-setup)
3. [API Integration](#api-integration)
4. [Privy Authentication Setup](#privy-authentication-setup)
5. [Environment Variables](#environment-variables)
6. [Testing the Setup](#testing-the-setup)

---

## Backend Setup

### Prerequisites
- Node.js 18+ and pnpm installed
- PostgreSQL database
- Redis (for caching)
- Privy App ID (from [dashboard.privy.io](https://dashboard.privy.io))

### Step 1: Install Dependencies

```bash
cd /Users/vighneshs/hunchdotrun
pnpm install
```

### Step 2: Database Setup

1. **Set up PostgreSQL database:**
   ```bash
   # Create a .env.local file in the root directory
   DATABASE_URL="postgresql://user:password@localhost:5432/hunchdb"
   ```

2. **Run Prisma migrations:**
   ```bash
   pnpm db:migrate
   ```

3. **Generate Prisma Client:**
   ```bash
   pnpm db:generate
   ```

### Step 3: Environment Variables

Create a `.env.local` file in the root directory with the following variables:

```env
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/hunchdb"

# Privy Authentication
NEXT_PUBLIC_PRIVY_APP_ID="your_privy_app_id_here"

# Solana RPC (optional, defaults to mainnet)
NEXT_PUBLIC_RPC_URL="https://api.mainnet-beta.solana.com"

# Redis (for caching)
UPSTASH_REDIS_REST_URL="your_redis_url"
UPSTASH_REDIS_REST_TOKEN="your_redis_token"

# Prediction Markets API (optional, defaults to dev)
NEXT_PUBLIC_PM_METADATA_API_BASE_URL="https://dev-prediction-markets-api.dflow.net"
```

### Step 4: Start the Backend Server

```bash
# Development mode (accessible from mobile devices on same network)
pnpm dev

# The server will run on http://0.0.0.0:3000
# For mobile access, use your computer's local IP address:
# http://YOUR_LOCAL_IP:3000
```

**Note:** To find your local IP address:
- **macOS/Linux:** `ifconfig | grep "inet " | grep -v 127.0.0.1`
- **Windows:** `ipconfig` (look for IPv4 Address)

### Step 5: Configure CORS (Important for Mobile)

The backend needs to accept requests from your Expo app. Update `next.config.ts` to include CORS headers:

```typescript
// Add this to your next.config.ts
async headers() {
  return [
    {
      source: '/api/:path*',
      headers: [
        {
          key: 'Access-Control-Allow-Origin',
          value: '*', // In production, replace with your Expo app URL
        },
        {
          key: 'Access-Control-Allow-Methods',
          value: 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        },
        {
          key: 'Access-Control-Allow-Headers',
          value: 'Content-Type, Authorization',
        },
      ],
    },
  ];
}
```

---

## Expo Frontend Setup

### Step 1: Initialize Expo Project

```bash
# Navigate to your desired location
cd /path/to/your/projects

# Create new Expo app
npx create-expo-app@latest hunch-mobile --template

# Choose "blank (TypeScript)" template
cd hunch-mobile
```

### Step 2: Install Required Dependencies

```bash
# Core dependencies
npx expo install expo-router react-native-safe-area-context react-native-screens
npx expo install @react-navigation/native @react-navigation/bottom-tabs

# Privy Authentication
npm install @privy-io/react-native

# HTTP client
npm install axios

# State management (optional but recommended)
npm install @tanstack/react-query

# Solana integration
npm install @solana/web3.js @solana/wallet-adapter-react-native

# UI components
npm install react-native-reanimated react-native-gesture-handler
npm install @expo/vector-icons

# Storage (for caching)
npm install @react-native-async-storage/async-storage

# Environment variables
npm install react-native-dotenv
```

### Step 3: Project Structure

Create the following directory structure:

```
hunch-mobile/
├── app/                    # Expo Router pages
│   ├── (tabs)/
│   │   ├── index.tsx      # Home feed
│   │   ├── markets.tsx    # Markets list
│   │   ├── profile.tsx    # User profile
│   │   └── _layout.tsx    # Tab layout
│   ├── market/
│   │   └── [ticker].tsx   # Market details
│   ├── event/
│   │   └── [eventId].tsx  # Event details
│   └── _layout.tsx        # Root layout
├── components/            # Reusable components
│   ├── AuthProvider.tsx
│   ├── MarketCard.tsx
│   ├── TradeModal.tsx
│   └── ...
├── lib/                  # Utilities and API client
│   ├── api.ts            # API client
│   ├── auth.ts           # Auth utilities
│   └── storage.ts        # Storage utilities
├── types/                # TypeScript types
│   └── index.ts
├── app.json
├── package.json
└── .env
```

### Step 4: Environment Variables

Create a `.env` file in the Expo project root:

```env
# Backend API URL
# For development, use your local IP address
EXPO_PUBLIC_API_URL=http://YOUR_LOCAL_IP:3000

# Privy App ID (same as backend)
EXPO_PUBLIC_PRIVY_APP_ID=your_privy_app_id_here

# Solana RPC
EXPO_PUBLIC_RPC_URL=https://api.mainnet-beta.solana.com

# Prediction Markets API
EXPO_PUBLIC_PM_METADATA_API_BASE_URL=https://dev-prediction-markets-api.dflow.net
```

### Step 5: Configure Expo Router

Update `app.json`:

```json
{
  "expo": {
    "name": "Hunch",
    "slug": "hunch-mobile",
    "version": "1.0.0",
    "orientation": "portrait",
    "scheme": "hunch",
    "userInterfaceStyle": "dark",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#0D0D0D"
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.hunch.app"
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0D0D0D"
      },
      "package": "com.hunch.app"
    },
    "plugins": [
      "expo-router"
    ],
    "experiments": {
      "typedRoutes": true
    }
  }
}
```

### Step 6: Create API Client

Create `lib/api.ts`:

```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token if available
apiClient.interceptors.request.use(
  async (config) => {
    // You can add auth tokens here if needed
    // const token = await AsyncStorage.getItem('auth_token');
    // if (token) {
    //   config.headers.Authorization = `Bearer ${token}`;
    // }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      // Handle unauthorized - clear storage and redirect to login
      await AsyncStorage.clear();
    }
    return Promise.reject(error);
  }
);

// API endpoints
export const api = {
  // Users
  syncUser: (data: { privyId: string; walletAddress: string; displayName?: string; avatarUrl?: string }) =>
    apiClient.post('/api/users/sync', data),
  
  getUser: (userId: string) =>
    apiClient.get(`/api/users/${userId}`),
  
  searchUsers: (query: string) =>
    apiClient.get(`/api/users/search?q=${encodeURIComponent(query)}`),
  
  // Feed
  getFeed: (params: { userId?: string; mode?: 'following' | 'global'; limit?: number; offset?: number }) => {
    const queryParams = new URLSearchParams();
    if (params.userId) queryParams.append('userId', params.userId);
    if (params.mode) queryParams.append('mode', params.mode);
    if (params.limit) queryParams.append('limit', params.limit.toString());
    if (params.offset) queryParams.append('offset', params.offset.toString());
    return apiClient.get(`/api/feed?${queryParams.toString()}`);
  },
  
  // Trades
  createTrade: (data: {
    userId: string;
    marketTicker: string;
    eventTicker?: string;
    side: 'yes' | 'no';
    amount: string;
    transactionSig: string;
    quote?: string;
    entryPrice?: number;
  }) => apiClient.post('/api/trades', data),
  
  getTrades: (userId: string, limit?: number, offset?: number) => {
    const params = new URLSearchParams({ userId });
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    return apiClient.get(`/api/trades?${params.toString()}`);
  },
  
  updateTradeQuote: (tradeId: string, quote: string, userId: string) =>
    apiClient.patch('/api/trades', { tradeId, quote, userId }),
  
  // Follow
  followUser: (followerId: string, followingId: string) =>
    apiClient.post('/api/follow', { followerId, followingId }),
  
  unfollowUser: (followerId: string, followingId: string) =>
    apiClient.delete('/api/follow', { data: { followerId, followingId } }),
  
  getFollowers: (userId: string) =>
    apiClient.get(`/api/follow/followers?userId=${userId}`),
  
  getFollowing: (userId: string) =>
    apiClient.get(`/api/follow/following?userId=${userId}`),
  
  // Positions
  getPositions: (userId: string) =>
    apiClient.get(`/api/positions?userId=${userId}`),
  
  // Markets (from external API)
  getMarkets: (limit?: number) => {
    const url = process.env.EXPO_PUBLIC_PM_METADATA_API_BASE_URL || 
                'https://dev-prediction-markets-api.dflow.net';
    return axios.get(`${url}/api/v1/markets?limit=${limit || 200}`);
  },
  
  getMarketDetails: (ticker: string) => {
    const url = process.env.EXPO_PUBLIC_PM_METADATA_API_BASE_URL || 
                'https://dev-prediction-markets-api.dflow.net';
    return axios.get(`${url}/api/v1/market/${encodeURIComponent(ticker)}`);
  },
  
  getEvents: (params?: { limit?: number; status?: string; cursor?: string }) => {
    const url = process.env.EXPO_PUBLIC_PM_METADATA_API_BASE_URL || 
                'https://dev-prediction-markets-api.dflow.net';
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.cursor) queryParams.append('cursor', params.cursor);
    return axios.get(`${url}/api/v1/events?${queryParams.toString()}`);
  },
  
  getEventDetails: (eventTicker: string) => {
    const url = process.env.EXPO_PUBLIC_PM_METADATA_API_BASE_URL || 
                'https://dev-prediction-markets-api.dflow.net';
    return axios.get(`${url}/api/v1/event/${encodeURIComponent(eventTicker)}?withNestedMarkets=true`);
  },
};

export default apiClient;
```

### Step 7: Create Privy Auth Provider

Create `components/AuthProvider.tsx`:

```typescript
import React, { createContext, useContext, useEffect, useState } from 'react';
import { PrivyProvider, usePrivy } from '@privy-io/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api } from '../lib/api';

interface AuthContextType {
  user: any;
  userId: string | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  syncUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || '';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  return (
    <PrivyProvider appId={PRIVY_APP_ID}>
      <AuthContextProvider>{children}</AuthContextProvider>
    </PrivyProvider>
  );
}

function AuthContextProvider({ children }: { children: React.ReactNode }) {
  const { ready, authenticated, user, login: privyLogin, logout: privyLogout } = usePrivy();
  const [userId, setUserId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (ready) {
      checkAuth();
    }
  }, [ready, authenticated]);

  const checkAuth = async () => {
    try {
      const cachedUserId = await AsyncStorage.getItem('hunch_user_id');
      if (authenticated && user) {
        if (!cachedUserId) {
          await syncUser();
        } else {
          setUserId(cachedUserId);
        }
      } else {
        setUserId(null);
        await AsyncStorage.clear();
      }
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const syncUser = async () => {
    if (!user) return;

    try {
      const privyId = user.id;
      const walletAddress = user.wallet?.address || '';
      const displayName = user.twitter?.username || user.google?.email || null;
      const avatarUrl = user.twitter?.profilePictureUrl || user.google?.pictureUrl || null;

      const response = await api.syncUser({
        privyId,
        walletAddress,
        displayName,
        avatarUrl,
      });

      const syncedUserId = response.data.id;
      setUserId(syncedUserId);
      await AsyncStorage.setItem('hunch_user_id', syncedUserId);
      await AsyncStorage.setItem('hunch_privy_id', privyId);
    } catch (error) {
      console.error('Error syncing user:', error);
    }
  };

  const login = async () => {
    try {
      await privyLogin();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const logout = async () => {
    try {
      await privyLogout();
      setUserId(null);
      await AsyncStorage.clear();
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        userId,
        isLoading,
        login,
        logout,
        syncUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
```

### Step 8: Create Root Layout

Create `app/_layout.tsx`:

```typescript
import { Stack } from 'expo-router';
import { AuthProvider } from '../components/AuthProvider';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <Stack
            screenOptions={{
              headerStyle: {
                backgroundColor: '#0D0D0D',
              },
              headerTintColor: '#fff',
              headerTitleStyle: {
                fontWeight: 'bold',
              },
            }}
          />
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
```

### Step 9: Create Tab Layout

Create `app/(tabs)/_layout.tsx`:

```typescript
import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#06b6d4',
        tabBarInactiveTintColor: '#666',
        tabBarStyle: {
          backgroundColor: '#0D0D0D',
          borderTopColor: '#1a1a1a',
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Feed',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="home" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="markets"
        options={{
          title: 'Markets',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="trending-up" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
```

### Step 10: Create Home Feed Screen

Create `app/(tabs)/index.tsx`:

```typescript
import { View, Text, FlatList, StyleSheet, ActivityIndicator } from 'react-native';
import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { api } from '../../lib/api';

interface FeedItem {
  id: string;
  userId: string;
  marketTicker: string;
  side: string;
  amount: string;
  createdAt: string;
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export default function FeedScreen() {
  const { userId, isLoading: authLoading } = useAuth();
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading) {
      loadFeed();
    }
  }, [userId, authLoading]);

  const loadFeed = async () => {
    try {
      setLoading(true);
      const response = await api.getFeed({
        userId: userId || undefined,
        mode: userId ? 'following' : 'global',
        limit: 50,
      });
      setFeed(response.data);
    } catch (error) {
      console.error('Error loading feed:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={feed}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <View style={styles.feedItem}>
            <Text style={styles.userName}>
              {item.user.displayName || 'Anonymous'}
            </Text>
            <Text style={styles.tradeInfo}>
              {item.side === 'yes' ? 'Bought' : 'Sold'} {item.marketTicker}
            </Text>
            <Text style={styles.amount}>Amount: {item.amount}</Text>
          </View>
        )}
        refreshing={loading}
        onRefresh={loadFeed}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text style={styles.emptyText}>No trades yet</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  feedItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  userName: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  tradeInfo: {
    color: '#ccc',
    fontSize: 14,
    marginBottom: 4,
  },
  amount: {
    color: '#06b6d4',
    fontSize: 14,
  },
  emptyText: {
    color: '#666',
    fontSize: 16,
  },
});
```

---

## API Integration

### Available API Endpoints

#### Users
- `POST /api/users/sync` - Sync user with Privy data
- `GET /api/users/[userId]` - Get user by ID
- `GET /api/users/search?q=query` - Search users
- `POST /api/users/batch` - Get multiple users

#### Feed
- `GET /api/feed?userId=xxx&mode=following|global&limit=50&offset=0` - Get social feed

#### Trades
- `POST /api/trades` - Create a trade
- `GET /api/trades?userId=xxx&limit=50&offset=0` - Get user trades
- `PATCH /api/trades` - Update trade quote

#### Follow
- `POST /api/follow` - Follow a user
- `DELETE /api/follow` - Unfollow a user
- `GET /api/follow/followers?userId=xxx` - Get followers
- `GET /api/follow/following?userId=xxx` - Get following

#### Positions
- `GET /api/positions?userId=xxx` - Get user positions

#### Markets (External API)
- `GET /api/v1/markets?limit=200` - Get markets
- `GET /api/v1/market/[ticker]` - Get market details
- `GET /api/v1/events?limit=500&status=open` - Get events
- `GET /api/v1/event/[eventTicker]?withNestedMarkets=true` - Get event details

---

## Privy Authentication Setup

### Step 1: Configure Privy Dashboard

1. Go to [dashboard.privy.io](https://dashboard.privy.io)
2. Select your app
3. Go to **Settings** → **App Settings**
4. Add your Expo app bundle identifier:
   - iOS: `com.hunch.app`
   - Android: `com.hunch.app`
5. Configure OAuth providers (Twitter, Google)
6. Enable Solana wallet support

### Step 2: Update Privy Config

The Privy React Native SDK configuration should match your backend setup:

```typescript
// In your AuthProvider
<PrivyProvider
  appId={PRIVY_APP_ID}
  config={{
    appearance: {
      theme: 'dark',
      accentColor: '#06b6d4',
    },
    loginMethods: ['twitter', 'google'],
    embeddedWallets: {
      createOnLogin: 'users-without-wallets',
    },
  }}
>
```

---

## Testing the Setup

### Backend Testing

1. **Start the backend:**
   ```bash
   cd /Users/vighneshs/hunchdotrun
   pnpm dev
   ```

2. **Test API endpoint:**
   ```bash
   curl http://localhost:3000/api/feed?mode=global&limit=10
   ```

### Frontend Testing

1. **Start Expo:**
   ```bash
   cd hunch-mobile
   npx expo start
   ```

2. **Run on device:**
   - Scan QR code with Expo Go app (iOS/Android)
   - Or press `i` for iOS simulator, `a` for Android emulator

3. **Test authentication:**
   - Tap login button
   - Authenticate with Twitter/Google
   - Verify user sync works

### Common Issues

1. **CORS errors:**
   - Make sure CORS headers are configured in `next.config.ts`
   - Use your computer's local IP, not `localhost`

2. **Network errors:**
   - Ensure phone and computer are on same WiFi network
   - Check firewall settings
   - Verify API URL in `.env` file

3. **Privy auth errors:**
   - Verify `EXPO_PUBLIC_PRIVY_APP_ID` matches backend
   - Check Privy dashboard configuration
   - Ensure bundle identifiers match

---

## Next Steps

1. **Implement remaining screens:**
   - Markets list
   - Market details
   - Event details
   - User profile
   - Trade modal

2. **Add features:**
   - Push notifications
   - Deep linking
   - Offline support
   - Image caching

3. **Optimize:**
   - Add React Query for caching
   - Implement pagination
   - Add error boundaries
   - Performance monitoring

4. **Deploy:**
   - Set up production backend (Vercel/Railway)
   - Configure production API URLs
   - Build and submit to app stores

---

## Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [Privy React Native Docs](https://docs.privy.io/guide/react/react-native)
- [React Native Documentation](https://reactnative.dev/)
- [Next.js API Routes](https://nextjs.org/docs/app/building-your-application/routing/route-handlers)

