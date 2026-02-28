# Expo Sample Files

Ready-to-use code files for your Expo app. Copy these into your Expo project.

## File Structure

```
hunch-mobile/
├── app/
│   ├── _layout.tsx
│   ├── (tabs)/
│   │   ├── _layout.tsx
│   │   ├── index.tsx
│   │   ├── markets.tsx
│   │   └── profile.tsx
│   ├── market/
│   │   └── [ticker].tsx
│   └── event/
│       └── [eventId].tsx
├── components/
│   ├── AuthProvider.tsx
│   ├── MarketCard.tsx
│   └── TradeModal.tsx
├── lib/
│   ├── api.ts
│   └── storage.ts
└── types/
    └── index.ts
```

---

## 1. `lib/api.ts`

```typescript
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';
const PM_API_BASE_URL = process.env.EXPO_PUBLIC_PM_METADATA_API_BASE_URL || 
                        'https://dev-prediction-markets-api.dflow.net';

const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      await AsyncStorage.clear();
    }
    return Promise.reject(error);
  }
);

export const api = {
  // Users
  syncUser: (data: {
    privyId: string;
    walletAddress: string;
    displayName?: string;
    avatarUrl?: string;
  }) => apiClient.post('/api/users/sync', data),
  
  getUser: (userId: string) => apiClient.get(`/api/users/${userId}`),
  
  searchUsers: (query: string) =>
    apiClient.get(`/api/users/search?q=${encodeURIComponent(query)}`),
  
  // Feed
  getFeed: (params: {
    userId?: string;
    mode?: 'following' | 'global';
    limit?: number;
    offset?: number;
  }) => {
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
  
  // Markets (External API)
  getMarkets: (limit?: number) =>
    axios.get(`${PM_API_BASE_URL}/api/v1/markets?limit=${limit || 200}`),
  
  getMarketDetails: (ticker: string) =>
    axios.get(`${PM_API_BASE_URL}/api/v1/market/${encodeURIComponent(ticker)}`),
  
  getEvents: (params?: {
    limit?: number;
    status?: string;
    cursor?: string;
  }) => {
    const queryParams = new URLSearchParams();
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.status) queryParams.append('status', params.status);
    if (params?.cursor) queryParams.append('cursor', params.cursor);
    return axios.get(`${PM_API_BASE_URL}/api/v1/events?${queryParams.toString()}`);
  },
  
  getEventDetails: (eventTicker: string) =>
    axios.get(
      `${PM_API_BASE_URL}/api/v1/event/${encodeURIComponent(eventTicker)}?withNestedMarkets=true`
    ),
};

export default apiClient;
```

---

## 2. `components/AuthProvider.tsx`

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
  return (
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

---

## 3. `app/_layout.tsx`

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

---

## 4. `app/(tabs)/_layout.tsx`

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

---

## 5. `app/(tabs)/index.tsx`

```typescript
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
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
  quote: string | null;
  user: {
    displayName: string | null;
    avatarUrl: string | null;
  };
}

export default function FeedScreen() {
  const { userId, isLoading: authLoading, login, authenticated } = useAuth();
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

  if (authLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  if (!authenticated) {
    return (
      <View style={styles.center}>
        <Text style={styles.title}>Welcome to Hunch</Text>
        <TouchableOpacity style={styles.loginButton} onPress={login}>
          <Text style={styles.loginButtonText}>Login</Text>
        </TouchableOpacity>
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
            {item.quote && (
              <Text style={styles.quote}>{item.quote}</Text>
            )}
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
    backgroundColor: '#0D0D0D',
  },
  title: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 20,
  },
  loginButton: {
    backgroundColor: '#06b6d4',
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  loginButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
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
  quote: {
    color: '#06b6d4',
    fontSize: 14,
    marginBottom: 4,
    fontStyle: 'italic',
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

## 6. `app/(tabs)/markets.tsx`

```typescript
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { api } from '../../lib/api';

interface Market {
  ticker: string;
  title: string;
  status: string;
  volume?: number;
}

export default function MarketsScreen() {
  const router = useRouter();
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMarkets();
  }, []);

  const loadMarkets = async () => {
    try {
      setLoading(true);
      const response = await api.getMarkets(50);
      setMarkets(response.data.markets || []);
    } catch (error) {
      console.error('Error loading markets:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={markets}
        keyExtractor={(item) => item.ticker}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.marketItem}
            onPress={() => router.push(`/market/${item.ticker}`)}
          >
            <Text style={styles.marketTitle}>{item.title}</Text>
            <Text style={styles.marketTicker}>{item.ticker}</Text>
            {item.volume && (
              <Text style={styles.marketVolume}>Volume: ${item.volume.toLocaleString()}</Text>
            )}
          </TouchableOpacity>
        )}
        refreshing={loading}
        onRefresh={loadMarkets}
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
  marketItem: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a1a',
  },
  marketTitle: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  marketTicker: {
    color: '#06b6d4',
    fontSize: 14,
    marginBottom: 4,
  },
  marketVolume: {
    color: '#666',
    fontSize: 12,
  },
});
```

---

## 7. `app/(tabs)/profile.tsx`

```typescript
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { useEffect, useState } from 'react';
import { useAuth } from '../../components/AuthProvider';
import { api } from '../../lib/api';

export default function ProfileScreen() {
  const { userId, user, logout, isLoading } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (userId) {
      loadProfile();
    }
  }, [userId]);

  const loadProfile = async () => {
    if (!userId) return;
    try {
      setLoading(true);
      const response = await api.getUser(userId);
      setProfile(response.data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  if (isLoading || loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#06b6d4" />
      </View>
    );
  }

  if (!userId || !profile) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>Not logged in</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.profileHeader}>
        <Text style={styles.profileName}>
          {profile.displayName || 'Anonymous'}
        </Text>
        <Text style={styles.walletAddress}>{profile.walletAddress}</Text>
      </View>

      <View style={styles.stats}>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.followerCount || 0}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statValue}>{profile.followingCount || 0}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
      </View>

      <TouchableOpacity style={styles.logoutButton} onPress={logout}>
        <Text style={styles.logoutButtonText}>Logout</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0D0D0D',
    padding: 20,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileHeader: {
    marginBottom: 30,
  },
  profileName: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  walletAddress: {
    color: '#666',
    fontSize: 14,
  },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 30,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    color: '#06b6d4',
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  statLabel: {
    color: '#666',
    fontSize: 14,
  },
  logoutButton: {
    backgroundColor: '#1a1a1a',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  logoutButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  errorText: {
    color: '#666',
    fontSize: 16,
  },
});
```

---

## 8. `types/index.ts`

```typescript
export interface User {
  id: string;
  privyId: string;
  walletAddress: string;
  displayName: string | null;
  avatarUrl: string | null;
  followerCount: number;
  followingCount: number;
}

export interface Trade {
  id: string;
  userId: string;
  marketTicker: string;
  eventTicker: string | null;
  side: 'yes' | 'no';
  amount: string;
  transactionSig: string;
  quote: string | null;
  entryPrice: number | null;
  createdAt: string;
}

export interface Market {
  ticker: string;
  title: string;
  status: string;
  volume?: number;
  yesMint?: string;
  noMint?: string;
  [key: string]: any;
}

export interface Event {
  ticker: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  markets?: Market[];
  [key: string]: any;
}
```

---

## Usage

1. Copy each file to your Expo project
2. Install missing dependencies if needed
3. Update environment variables in `.env`
4. Run `npx expo start`

All files are ready to use and follow React Native best practices!

