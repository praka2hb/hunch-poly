import { EventCarousel } from "@/components/EventCarousel";
import { EventMarketImageCarousel } from "@/components/EventMarketImageCarousel";
import { FilterPills } from "@/components/FilterPills";
import { MarketCard } from "@/components/MarketCard";
import MarketPopout from "@/components/MarketPopout";
import { MarketTradeSheet } from "@/components/MarketTradeSheet";
import { MiniNewsCarousel } from "@/components/MiniNewsCarousel";
import NotificationSidebar from "@/components/NotificationSidebar";
import { HomeFeedSkeleton, ListFooterSkeleton } from "@/components/skeletons";
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { api, marketsApi } from "@/lib/api";
import { Event, EventEvidence, Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Animated, FlatList, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";


// Jupiter category values
const JUPITER_CATEGORIES = [
  'all',
  'crypto',
  'sports',
  'politics',
  'esports',
  'culture',
  'economics',
  'tech',
];

// Cache for tags response
let tagsCache: { categories: string[]; timestamp: number } | null = null;
const TAGS_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

// News event tickers for evidence
const NEWS_EVENT_TICKERS = ['KXFEDDECISION-26JAN', 'KXFEDCHAIRNOM-29'];
const DUMMY_PORTFOLIO_VALUE = 1250.75;
const DUMMY_PORTFOLIO_PNL = 48.2;

// Feed item types for mixed list
type FeedItem =
  | { type: 'market'; data: Market }
  | { type: 'eventCarousel'; data: Event[] }
  | { type: 'news'; data: EventEvidence[] };

export default function HomeScreen() {
  const { preferences, backendUser } = useUser();
  const { fundWallet } = useFundSolanaWallet();
  const { wallets } = useEmbeddedSolanaWallet();
  const router = useRouter();
  const [categories, setCategories] = useState<string[]>(JUPITER_CATEGORIES);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [events, setEvents] = useState<Event[]>([]);
  const [markets, setMarkets] = useState<Market[]>([]);
  const [newsItems, setNewsItems] = useState<EventEvidence[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [portfolioValue, setPortfolioValue] = useState<number | null>(null);
  const [portfolioPnl, setPortfolioPnl] = useState<number | null>(null);
  const [headerCollapsed, setHeaderCollapsed] = useState(false);
  const headerAnim = useRef(new Animated.Value(0)).current;
  const [marketSheetVisible, setMarketSheetVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [selectedMarketEventTitle, setSelectedMarketEventTitle] = useState<string | undefined>(undefined);
  const [notifSidebarVisible, setNotifSidebarVisible] = useState(false);
  const [popoutVisible, setPopoutVisible] = useState(false);
  const [popoutMarket, setPopoutMarket] = useState<Market | null>(null);
  const [popoutEventTitle, setPopoutEventTitle] = useState<string | undefined>(undefined);

  const isLoadingRef = useRef(false);
  const cursorRef = useRef<string | undefined>(undefined);
  const inFlightPageKeyRef = useRef<string | null>(null);
  const solanaWallet = wallets?.[0];

  const connection = useMemo(() => {
    const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
    return new Connection(rpcUrl, 'confirmed');
  }, []);

  useEffect(() => {
    const getProvider = async () => {
      if (solanaWallet) {
        try {
          const provider = await solanaWallet.getProvider();
          setWalletProvider(provider);
        } catch (error) {
          console.error('Failed to get wallet provider:', error);
        }
      }
    };
    getProvider();
  }, [solanaWallet]);

  // Get preferred categories from user interests
  const getPreferredCategories = (): string[] => {
    if (!preferences?.interests && !preferences?.habits) {
      return [];
    }

    // Use interests if available, otherwise fall back to habits mapping (backwards compatibility)
    if (preferences.interests && preferences.interests.length > 0) {
      return preferences.interests.filter(int => categories.includes(int));
    }

    // Legacy habits mapping (for backwards compatibility)
    const habitToCategories: Record<string, string[]> = {
      'Exercise': ['Sports', 'Transportation'],
      'Meditate': ['Social', 'Entertainment'],
      'Read books': ['Science and Technology', 'Entertainment'],
      'Plan a day': [],
      'Do yoga': ['Sports'],
      'Write in journal': ['Social'],
      'Healthy breakfast': ['Companies', 'Economics'],
    };

    const relevantCategories = new Set<string>();
    (preferences.habits || []).forEach(habit => {
      const cats = habitToCategories[habit] || [];
      cats.forEach(cat => relevantCategories.add(cat));
    });

    return Array.from(relevantCategories);
  };

  // Load categories and news on mount
  useEffect(() => {
    loadCategories();
  }, []);

  // Reload news when preferences change
  useEffect(() => {
    loadNews();
  }, [preferences]);

  // Set default category based on preferences when they're loaded
  useEffect(() => {
    if (categories.length > 1) {
      const preferredCategories = getPreferredCategories();
      if (preferredCategories.length > 0) {
        // Prioritize first preferred category
        setSelectedCategory(preferredCategories[0]);
      }
    }
  }, [preferences, categories]);

  // Load events when category changes (only on initial mount, not on filter clicks)
  useEffect(() => {
    // Only load if it's the initial load (loading is true)
    if (loading) {
      loadEventsForCategory(selectedCategory, true, false);
    }
  }, []);

  // Load portfolio value
  const loadPortfolioValue = useCallback(async () => {
    if (!backendUser) {
      setPortfolioValue(DUMMY_PORTFOLIO_VALUE);
      setPortfolioPnl(DUMMY_PORTFOLIO_PNL);
      return;
    }
    try {
      const { positions } = await api.getPositions(backendUser.id);
      const totalPositionValue = positions.active.reduce((sum, pos) => {
        return sum + (pos.currentValue || 0);
      }, 0);
      const totalPnl = positions.active.reduce((sum, pos) => {
        if (typeof pos.profitLoss === 'number') return sum + pos.profitLoss;
        const cv = typeof pos.currentValue === 'number' ? pos.currentValue : 0;
        const cb = typeof pos.totalCostBasis === 'number' ? pos.totalCostBasis : 0;
        return sum + (cv - cb);
      }, 0);
      setPortfolioValue(totalPositionValue);
      setPortfolioPnl(totalPnl);
    } catch (error) {
      setPortfolioValue(DUMMY_PORTFOLIO_VALUE);
      setPortfolioPnl(DUMMY_PORTFOLIO_PNL);
    }
  }, [backendUser]);

  useEffect(() => {
    loadPortfolioValue();
  }, [loadPortfolioValue]);

  // Load news evidence - filter by preferences if available
  const loadNews = async () => {
    try {
      const evidence = await api.fetchEvidence(NEWS_EVENT_TICKERS);

      // Filter news by preferred categories if user has preferences
      const preferredCategories = getPreferredCategories();
      if (preferredCategories.length > 0) {
        // For now, we show all news, but this could be enhanced to filter by event categories
        // when the evidence includes category information
        setNewsItems(evidence);
      } else {
        setNewsItems(evidence);
      }
    } catch (err) {
      setNewsItems([]);
    }
  };

  const loadCategories = async () => {
    try {
      // Check cache first
      if (tagsCache && Date.now() - tagsCache.timestamp < TAGS_CACHE_DURATION) {
        setCategories(tagsCache.categories);
        return;
      }

      tagsCache = { categories: JUPITER_CATEGORIES, timestamp: Date.now() };
      setCategories(JUPITER_CATEGORIES);
    } catch (err) {
      console.error("Failed to fetch categories:", err);
      setCategories(JUPITER_CATEGORIES);
    }
  };

  const loadEventsForCategory = async (category: string, reset: boolean = false, isFilterChange: boolean = false) => {
    if (isLoadingRef.current && !reset) return;
    const requestCursor = reset ? undefined : cursorRef.current;
    if (!reset) {
      const requestKey = `${category}:${requestCursor ?? '0'}`;
      if (inFlightPageKeyRef.current === requestKey) return;
      inFlightPageKeyRef.current = requestKey;
    }
    isLoadingRef.current = true;

    try {
      if (reset) {
        // Only show full loading on initial load, not on filter changes
        if (isFilterChange) {
          setFilterLoading(true);
        } else {
          setLoading(true);
        }
        setError(null);
        cursorRef.current = undefined;
        setHasMore(true);
      } else {
        setLoadingMore(true);
      }

      const apiCategory = category;

      // Fetch using the optimized consolidated endpoint
      // Backend now handles filtering, sorting, and market extraction
      const result = await marketsApi.fetchHomeFeed(
        20,
        requestCursor,
        apiCategory === 'all' ? undefined : apiCategory
      );

      // Events and topMarkets are now pre-processed by the backend
      const fetchedEvents = result.events || [];
      const fetchedMarkets = result.topMarkets || [];

      if (reset) {
        setEvents(fetchedEvents);
        setMarkets(fetchedMarkets);
      } else {
        setEvents(prev => [...prev, ...fetchedEvents]);
        setMarkets(prev => [...prev, ...fetchedMarkets]);
      }

      cursorRef.current = result.cursor;
      // Use metadata.hasMore from backend instead of client-side calculation
      setHasMore(result.metadata?.hasMore ?? false);
    } catch (err) {
      console.error("Failed to fetch events:", err);
      if (reset) {
        setError("Failed to load events");
      }
    } finally {
      setLoading(false);
      setFilterLoading(false);
      setLoadingMore(false);
      isLoadingRef.current = false;
      inFlightPageKeyRef.current = null;
    }
  };


  const handleCategoryChange = useCallback((category: string) => {
    setSelectedCategory(category);
    // Trigger filter change loading
    loadEventsForCategory(category, true, true);
  }, []);

  const handleLoadMore = useCallback(() => {
    // Pagination is supported if we have a cursor/hasMore
    if (
      hasMore &&
      !loading &&
      !loadingMore &&
      !!cursorRef.current
    ) {
      loadEventsForCategory(selectedCategory, false);
    }
  }, [selectedCategory, hasMore, loading, loadingMore]);

  const handleRefresh = useCallback(() => {
    loadEventsForCategory(selectedCategory, true);
  }, [selectedCategory]);

  // Animated header transitions
  const valueScale = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });

  const extrasOpacity = headerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0],
  });

  const eventTitleByTicker = useMemo(() => {
    const map = new Map<string, string>();
    events.forEach((event) => map.set(event.ticker, event.title));
    return map;
  }, [events]);

  const handleOpenMarketSheet = (marketItem: Market) => {
    setSelectedMarket(marketItem);
    if (marketItem.eventTicker) {
      setSelectedMarketEventTitle(eventTitleByTicker.get(marketItem.eventTicker) || marketItem.title);
    } else {
      setSelectedMarketEventTitle(marketItem.title);
    }
    setMarketSheetVisible(true);
  };

  const handleCloseMarketSheet = () => {
    setMarketSheetVisible(false);
  };

  // Create mixed feed items (markets list with event carousels + news carousel)
  const feedItems = useMemo((): FeedItem[] => {
    const items: FeedItem[] = [];

    // Show markets first.
    markets.forEach((market) => items.push({ type: 'market', data: market }));

    // Keep news in the feed (single block) right after markets.
    if (newsItems.length > 0) {
      items.push({ type: 'news', data: newsItems });
    }

    // Show all events below markets.
    if (events.length > 0) {
      items.push({ type: 'eventCarousel', data: events });
    }

    return items;
  }, [events, markets, newsItems]);

  const renderFeedItem = ({ item }: { item: FeedItem }) => {
    if (item.type === 'news') {
      return <MiniNewsCarousel items={item.data} />;
    }
    if (item.type === 'eventCarousel') {
      return <EventCarousel items={item.data} />;
    }
    if (item.type === 'market') {
      return (
        <MarketCard
          item={item.data}
          onPress={() => handleOpenMarketSheet(item.data)}
          onLongPress={() => {
            setPopoutMarket(item.data);
            setPopoutEventTitle(item.data.eventTicker ? eventTitleByTicker.get(item.data.eventTicker) : undefined);
            setPopoutVisible(true);
          }}
          eventTitle={item.data.eventTicker ? eventTitleByTicker.get(item.data.eventTicker) : undefined}
        />
      );
    }
    return null;
  };

  const renderFooter = () => {
    if (!loadingMore) return null;
    return <ListFooterSkeleton />;
  };

  return (
    <View className="flex-1 bg-white">
      <SafeAreaView className="flex-1" edges={['top']}>
        {/* Header with Portfolio Value / PnL / Add Cash (collapses on scroll) */}
        <Animated.View className="px-5 pt-2 pb-2 flex-row items-center justify-between">
          <View className={headerCollapsed ? 'flex-1 items-center' : 'flex-1'}>
            {portfolioValue !== null ? (
              <>
                <View className="flex-row items-center gap-2">
                  <Animated.Text
                    className="text-2xl font-extrabold text-txt-primary tracking-tight"
                    style={{ transform: [{ scale: valueScale }] }}
                  >
                    {portfolioValue >= 1000000
                      ? `$${(portfolioValue / 1000000).toFixed(2)}M`
                      : portfolioValue >= 1000
                        ? `$${(portfolioValue / 1000).toFixed(1)}K`
                        : `$${portfolioValue.toFixed(2)}`}
                  </Animated.Text>

                </View>
                {portfolioPnl !== null && (
                  <Animated.Text
                    className="text-[16px] font-semibold mt-1"
                    style={{
                      opacity: extrasOpacity,
                      color: portfolioPnl >= 0 ? Theme.chartNeutral : Theme.error,
                    }}
                  >
                    {portfolioPnl >= 0 ? '+' : '-'}${Math.abs(portfolioPnl).toFixed(2)}
                  </Animated.Text>
                )}
              </>
            ) : (
              <Text className="text-2xl font-extrabold text-txt-primary tracking-tight">
                —
              </Text>
            )}
          </View>
          <Animated.View
            style={[
              { opacity: extrasOpacity },
              headerCollapsed && { position: 'absolute', right: 20 },
              { flexDirection: 'row', alignItems: 'center', gap: 8 },
            ]}
          >
            <TouchableOpacity
              className="flex-row items-center gap-1.5 px-3.5 py-2 rounded-md bg-slate-200"
              onPress={() => {
                if (backendUser?.walletAddress) {
                  fundWallet({ asset: 'USDC', address: backendUser.walletAddress, amount: "10" });
                }
              }}
              activeOpacity={0.7}
            >
              <Text className="text-[15px] font-medium text-txt-primary">+ Add Cash</Text>
            </TouchableOpacity>
            <TouchableOpacity
              className="w-10 h-10 rounded-full justify-center items-center"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setNotifSidebarVisible(true);
              }}
            >
              <Ionicons name="notifications-outline" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>

        {/* Scrollable content: Filters + MarketRail + Events + News */}
        <>
          {/* Filters always visible */}
          <FilterPills
            categories={categories}
            selectedCategory={selectedCategory}
            onCategoryChange={handleCategoryChange}
            preferredCategories={getPreferredCategories()}
          />

          {/* Content with loading states */}
          {loading || filterLoading ? (
            <HomeFeedSkeleton showFilters={false} />
          ) : error ? (
            <View className="flex-1 justify-center items-center">
              <Text className="text-status-error text-base mb-3">{error}</Text>
              <TouchableOpacity
                className="bg-txt-primary py-2.5 px-5 rounded-lg"
                onPress={handleRefresh}
              >
                <Text className="text-txt-inverse text-sm font-semibold">Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={feedItems}
              keyExtractor={(item, index) => {
                if (item.type === 'news') return `news-${index}`;
                if (item.type === 'market') return `market-${item.data.ticker}`;
                if (item.type === 'eventCarousel') return `event-carousel-${index}`;
                return `item-${index}`;
              }}
              renderItem={renderFeedItem}
              contentContainerStyle={{ paddingBottom: 80 }}
              showsVerticalScrollIndicator={false}
              refreshing={false}
              onRefresh={handleRefresh}
              onScroll={(event) => {
                const offsetY = event.nativeEvent.contentOffset.y;
                const shouldCollapse = offsetY > 40;
                setHeaderCollapsed((prev) => {
                  if (prev === shouldCollapse) return prev;
                  Animated.timing(headerAnim, {
                    toValue: shouldCollapse ? 1 : 0,
                    duration: 200,
                    useNativeDriver: true,
                  }).start();
                  return shouldCollapse;
                });
              }}
              scrollEventThrottle={16}
              onEndReached={handleLoadMore}
              onEndReachedThreshold={0.5}
              ListHeaderComponent={
                <>
                  <EventMarketImageCarousel items={events} />
                  {loadingMore ? (
                    <View className="px-5 pb-3 flex-row items-center justify-center">
                      <ActivityIndicator size="small" color={Theme.textSecondary} />
                      <Text className="ml-2 text-sm text-txt-secondary">Loading more events...</Text>
                    </View>
                  ) : null}
                </>
              }
              ListFooterComponent={renderFooter}
              ItemSeparatorComponent={() => null}
              ListEmptyComponent={
                <View className="flex-1 justify-center items-center py-20">
                  <Ionicons name="search-outline" size={48} color={Theme.textDisabled} />
                  <Text className="text-txt-secondary text-base mt-4">
                    No events or markets found
                  </Text>
                </View>
              }
            />
          )}
        </>
      </SafeAreaView>

      <MarketTradeSheet
        visible={marketSheetVisible}
        onClose={handleCloseMarketSheet}
        onTradeSuccess={() => { }}
        market={selectedMarket}
        backendUser={backendUser || null}
        walletProvider={walletProvider}
        connection={connection}
        eventTitle={selectedMarketEventTitle}
      />
      <NotificationSidebar
        visible={notifSidebarVisible}
        onClose={() => setNotifSidebarVisible(false)}
        backendUser={backendUser}
      />
      <MarketPopout
        visible={popoutVisible}
        market={popoutMarket}
        eventTitle={popoutEventTitle}
        onClose={() => setPopoutVisible(false)}
        onSave={(market) => {
          Alert.alert('Saved', `"${market.title}" has been saved.`);
        }}
        onGoToEvent={(market) => {
          if (market.eventTicker) {
            router.push({ pathname: '/event/[ticker]', params: { ticker: market.eventTicker } });
          }
        }}
      />
    </View>
  );
}
