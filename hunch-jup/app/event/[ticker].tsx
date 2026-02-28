import { MarketTradeSheet } from '@/components/MarketTradeSheet';
import { EventDetailSkeleton } from '@/components/skeletons';
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { marketsApi } from "@/lib/api";
import { isNumericOutcomeMarket } from "@/lib/marketUtils";
import { Event, Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

// Market colors (yellow, blue, black)
const MARKET_COLORS = ['#FACC15', '#22D3EE', '#000000'];
const FALLBACK_IMAGE_MARKER = 'kalshi-fallback-images';

// MarketCard for the list below charts
const MarketCard = ({ item, onPress, color }: { item: Market; onPress: () => void; color?: string }) => {
  const [imageFailed, setImageFailed] = useState(false);
  const isFallbackImage =
    typeof (item as any).image_url === 'string' &&
    (item as any).image_url.toLowerCase().includes(FALLBACK_IMAGE_MARKER);
  const yesBid = item.yesBid ? parseFloat(item.yesBid) * 100 : null;
  const yesAsk = item.yesAsk ? parseFloat(item.yesAsk) * 100 : null;
  const probability = yesBid && yesAsk ? (yesBid + yesAsk) / 2 : null;
  const displayTitle = item.yesSubTitle || item.title;
  const marketColor = color || Theme.textPrimary;

  // Darker versions of market colors for odds text
  const getDarkerColor = (color: string): string => {
    const darkerMap: Record<string, string> = {
      '#FACC15': '#D4A017', // Darker yellow
      '#22D3EE': '#0EA5E9', // Darker cyan
      '#22c55e': '#00e003', // Neon green brand
      '#000000': '#000000', // Dark black
    };
    return darkerMap[color] || color;
  };
  const darkerColor = getDarkerColor(marketColor);

  return (
    <TouchableOpacity
      className="rounded-2xl p-4 mb-3"
      activeOpacity={0.7}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
    >
      <View className="flex-row justify-between items-start gap-3">
        {item.image_url && !isFallbackImage && !imageFailed ? (
          <View
            style={{
              transform: [{ rotate: '-3deg' }],
              shadowColor: '#000000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.15,
              shadowRadius: 3,
              elevation: 4,
            }}
            className="w-16 h-16 items-center justify-center rounded-xl bg-white border-[2.5px] border-white"
          >
            <Image
              source={{ uri: item.image_url }}
              style={{ width: '100%', height: '100%', borderRadius: 9 }}
              contentFit="cover"
              onError={() => setImageFailed(true)}
            />
          </View>
        ) : null}
        <View className="flex-1">
          <Text className="text-2xl font-semibold text-txt-primary leading-[28px]" numberOfLines={2}>
            {displayTitle}
          </Text>

          {item.volume != null && item.volume > 0 && (
            <Text className="text-lg font-medium text-txt-disabled mt-1.5" style={{ opacity: 0.6 }}>
              ${(item.volume / 1000).toFixed(1)}K vol
            </Text>
          )}
        </View>
        {probability != null && (
          <View className="px-3.5 py-2 min-w-[64px] items-center">
            <Text className="text-[24px] font-bold" style={{ color: darkerColor }}>
              {probability.toFixed(0)}%
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity >
  );
};

export default function EventDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { backendUser } = useUser();
  const { wallets } = useEmbeddedSolanaWallet();
  const insets = useSafeAreaInsets();
  const [event, setEvent] = useState<Event | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [chartScrollEnabled, setChartScrollEnabled] = useState(true);
  const [marketSheetVisible, setMarketSheetVisible] = useState(false);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
  const [walletProvider, setWalletProvider] = useState<any>(null);
  const [showMoreMarkets, setShowMoreMarkets] = useState(false);
  const [heroImageError, setHeroImageError] = useState(false);
  const scrollY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setHeroImageError(false);
  }, [event?.imageUrl]);

  const connection = useMemo(() => {
    const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
    return new Connection(rpcUrl, 'confirmed');
  }, []);
  const solanaWallet = wallets?.[0];

  // Get wallet provider
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

  useEffect(() => {
    if (ticker) {
      loadEventDetails();
    }
  }, [ticker]);

  const loadEventDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await marketsApi.fetchEventDetails(ticker as string);
      setEvent(data);
    } catch (err) {
      console.error("Failed to fetch event details:", err);
      setError("Failed to load event details");
    } finally {
      setLoading(false);
    }
  };

  const activeMarkets = useMemo(() => {
    const markets = event?.markets?.filter(
      market => market.status !== 'finalized' &&
        market.status !== 'resolved' &&
        market.status !== 'closed'
    ) || [];

    return markets.sort((a, b) => {
      const aYesBid = a.yesBid ? parseFloat(a.yesBid) * 100 : 0;
      const aYesAsk = a.yesAsk ? parseFloat(a.yesAsk) * 100 : 0;
      const aProbability = aYesBid && aYesAsk ? (aYesBid + aYesAsk) / 2 : 0;

      const bYesBid = b.yesBid ? parseFloat(b.yesBid) * 100 : 0;
      const bYesAsk = b.yesAsk ? parseFloat(b.yesAsk) * 100 : 0;
      const bProbability = bYesBid && bYesAsk ? (bYesBid + bYesAsk) / 2 : 0;

      return bProbability - aProbability;
    });
  }, [event?.markets]);

  // Top 4 by odds (Yes implied probability); activeMarkets is already sorted by it
  const top4ByOdds = useMemo(() => activeMarkets.slice(0, 4), [activeMarkets]);
  const remainingMarkets = useMemo(() => activeMarkets.slice(4), [activeMarkets]);

  const topMarketsForCharts = useMemo(() => {
    return top4ByOdds.filter(
      m => m.yesMint || (m.accounts && Object.values(m.accounts).some(a => a?.yesMint))
    );
  }, [top4ByOdds]);

  const chartsSelectionMode = useMemo(
    () => topMarketsForCharts.length > 0 && topMarketsForCharts.every(isNumericOutcomeMarket),
    [topMarketsForCharts]
  );

  const handleOpenMarketSheet = (marketItem: Market) => {
    setSelectedMarket(marketItem);
    setMarketSheetVisible(true);
  };

  const handleCloseMarketSheet = () => {
    setMarketSheetVisible(false);
  };

  if (loading) {
    return (
      <View className="flex-1 bg-app-bg">
        <LinearGradient colors={[Theme.bgMain, Theme.bgCard]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView className="flex-1">
          <EventDetailSkeleton />
        </SafeAreaView>
      </View>
    );
  }

  if (error || !event) {
    return (
      <View className="flex-1 bg-app-bg">
        <LinearGradient colors={[Theme.bgMain, Theme.bgCard]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView className="flex-1">
          <View className="flex-row px-4 pt-2">
            <TouchableOpacity
              className="w-10 h-10 rounded-full bg-app-card justify-center items-center border border-border"
              onPress={() => router.back()}
            >
              <Ionicons name="chevron-back" size={22} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>
          <View className="flex-1 justify-center items-center px-8">
            <View className="w-20 h-20 rounded-full bg-[#FF10F0]/10 justify-center items-center mb-5">
              <Ionicons name="alert-circle-outline" size={48} color={Theme.error} />
            </View>
            <Text className="text-[17px] font-semibold text-txt-primary text-center mb-2">{error || "Event not found"}</Text>
            <Text className="text-sm text-txt-secondary text-center mb-6">Check your connection and try again.</Text>
            <TouchableOpacity className="bg-app-card py-3 px-6 rounded-xl border border-border" onPress={loadEventDetails}>
              <Text className="text-[15px] font-semibold text-txt-primary">Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-app-bg">
      <LinearGradient colors={[Theme.bgMain, Theme.bgCard]} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView className="flex-1" edges={['top']}>
        <Animated.ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 24 }}
          scrollEnabled={chartScrollEnabled}
          bounces={false}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: false }
          )}
          scrollEventThrottle={16}
        >
          {/* Hero: image with opacity blend - fades out as user scrolls */}
          <Animated.View
            className="h-52 overflow-hidden"
            style={{
              opacity: scrollY.interpolate({
                inputRange: [0, 150],
                outputRange: [1, 0],
                extrapolate: 'clamp',
              }),
            }}
          >
            {(event.imageUrl && !heroImageError) ? (
              <Image
                source={{ uri: event.imageUrl }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                transition={200}
                onError={() => setHeroImageError(true)}
              />
            ) : (
              <View className="w-full h-full bg-app-card justify-center items-center">
                <Ionicons name="image-outline" size={48} color={Theme.textDisabled} />
              </View>
            )}
            <LinearGradient
              colors={['transparent', Theme.bgMain]}
              style={StyleSheet.absoluteFillObject}
              pointerEvents="none"
            />
            {event.competition && (
              <View className="absolute bottom-3 left-4 px-2.5 py-1 rounded-lg bg-black/40">
                <Text className="text-[11px] font-bold text-white tracking-wide">{event.competition}</Text>
              </View>
            )}
          </Animated.View>

          {/* Main text below the image: white text, black outline only (no block bg) */}
          <View className="px-4 pt-4 pb-2">
            <View className="relative">
              {([[-2, -2], [-2, 0], [-2, 2], [0, -2], [0, 2], [2, -2], [2, 0], [2, 2], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const).map(([dx, dy]) => (
                <Text
                  key={`${dx},${dy}`}
                  className="text-[32px] font-bold leading-8"
                  style={{ position: 'absolute', left: dx, top: dy, color: '#000000', width: '100%' }}
                  numberOfLines={2}
                >
                  {event.title}
                </Text>
              ))}
              <Text
                className="text-[32px] font-bold leading-8 relative z-10"
                style={{ color: '#fff' }}
                numberOfLines={2}
              >
                {event.title}
              </Text>
            </View>

            {/* Market end/resolution time */}
            {(() => {
              // Get the earliest close/expiration time from active markets or event
              const marketCloseTimes = activeMarkets
                .map(m => m.closeTime || m.expirationTime)
                .filter((t): t is number => t != null && t > 0);

              const eventCloseTime = event.closeTime;
              const allCloseTimes = [...marketCloseTimes];
              if (eventCloseTime) allCloseTimes.push(eventCloseTime);

              const earliestCloseTime = allCloseTimes.length > 0
                ? Math.min(...allCloseTimes)
                : null;

              if (!earliestCloseTime) return null;

              const closeDate = new Date(earliestCloseTime * 1000);
              const now = new Date();
              const diffMs = closeDate.getTime() - now.getTime();
              const diffDays = diffMs / (1000 * 60 * 60 * 24);

              // Don't show if more than 2 years away
              if (diffDays > 730) return null;

              const formattedDate = closeDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: closeDate.getFullYear() !== now.getFullYear() ? 'numeric' : undefined
              });
              const formattedTime = closeDate.toLocaleTimeString('en-US', {
                hour: 'numeric',
                minute: '2-digit',
                hour12: true
              });

              let displayText = '';
              if (diffMs < 0) {
                displayText = `Resolved • ${formattedDate}`;
              } else if (diffDays <= 7) {
                // Within a week: show date and time
                displayText = `${formattedDate} at ${formattedTime}`;
              } else {
                // More than a week: show only date
                displayText = formattedDate;
              }

              return (
                <View className="mt-3 flex-row items-center gap-2">
                  <Ionicons name="time-outline" size={16} color={Theme.textSecondary} />
                  <Text className="text-sm text-txt-secondary">
                    {displayText}
                  </Text>
                </View>
              );
            })()}
          </View>
          {/* Charts section (currently commented out) */}
          {/* Charts */}
          {/* {topMarketsForCharts.length > 0 && (
            <View className="mt-2">
              <MultiMarketChart
                title="."
                markets={topMarketsForCharts}
                selectionMode={chartsSelectionMode}
                onInteractionStart={() => setChartScrollEnabled(false)}
                onInteractionEnd={() => setChartScrollEnabled(true)}
              />
            </View>
          )} */}

          {/* Top 4 by odds + Show more */}
          <View className="mt-6 px-4">
            {/* <Text className="text-[17px] font-bold text-txt-primary mb-3">Top 4 by odds</Text> */}
            {top4ByOdds.length === 0 ? (
              <View className="items-center py-10 gap-2.5">
                <Ionicons name="bar-chart-outline" size={44} color={Theme.textDisabled} />
                <Text className="text-base font-semibold text-txt-primary">No markets yet</Text>
                <Text className="text-sm text-txt-disabled">Markets for this event will appear here.</Text>
              </View>
            ) : (
              <>
                {top4ByOdds.map((m, index) => (
                  <MarketCard
                    key={m.ticker}
                    item={m}
                    color={MARKET_COLORS[index % MARKET_COLORS.length]}
                    onPress={() => handleOpenMarketSheet(m)}
                  />
                ))}
                {remainingMarkets.length > 0 && (
                  <>
                    <TouchableOpacity
                      className="flex-row items-center justify-center gap-1.5 py-3.5 mt-1 mb-2"
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setShowMoreMarkets((v) => !v);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text className="text-[15px] font-semibold text-[#333333]">
                        {showMoreMarkets ? 'Show less' : `Show more (${remainingMarkets.length})`}
                      </Text>
                      <Ionicons
                        name={showMoreMarkets ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={Theme.accentSubtle}
                      />
                    </TouchableOpacity>
                    {showMoreMarkets &&
                      remainingMarkets.map((m, index) => (
                        <MarketCard
                          key={m.ticker}
                          item={m}
                          color={MARKET_COLORS[(top4ByOdds.length + index) % MARKET_COLORS.length]}
                          onPress={() => handleOpenMarketSheet(m)}
                        />
                      ))}
                  </>
                )}
              </>
            )}
          </View>
        </Animated.ScrollView>
      </SafeAreaView>

      {/* Sticky header: main text with outline, fades in as main text scrolls off */}
      <Animated.View
        pointerEvents="box-none"
        style={[
          {
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            zIndex: 10,
            paddingHorizontal: 24,
            paddingBottom: 12,
            backgroundColor: Theme.bgMain,
          },
          {
            paddingTop: insets.top,
            opacity: scrollY.interpolate({
              inputRange: [100, 200],
              outputRange: [0, 1],
              extrapolate: 'clamp',
            }),
          },
        ]}
      >
        <View className="relative">
          {([[-2, -2], [-2, 0], [-2, 2], [0, -2], [0, 2], [2, -2], [2, 0], [2, 2], [-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const).map(([dx, dy]) => (
            <Text
              key={`sticky-${dx},${dy}`}
              className="text-[24px] font-bold leading-7"
              style={{ position: 'absolute', left: dx, top: dy, color: '#000000', width: '100%' }}
              numberOfLines={2}
            >
              {event.title}
            </Text>
          ))}
          <Text
            className="text-[24px] font-bold leading-7 relative z-10"
            style={{ color: '#fff' }}
            numberOfLines={2}
          >
            {event.title}
          </Text>
        </View>
      </Animated.View>

      <MarketTradeSheet
        visible={marketSheetVisible}
        onClose={handleCloseMarketSheet}
        onTradeSuccess={() => { }}
        market={selectedMarket}
        backendUser={backendUser || null}
        walletProvider={walletProvider}
        connection={connection}
        eventTitle={event?.title}
      />
    </View>
  );
}
