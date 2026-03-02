import { Theme } from "@/constants/theme";
import { Event, Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, Dimensions, FlatList, Text, TouchableOpacity, View } from "react-native";

interface EventMarketImageCarouselProps {
  items: Event[];
  isLoadingMore?: boolean;
}

const CARD_HORIZONTAL_PADDING = 20;
const CARD_WIDTH = Dimensions.get("window").width - CARD_HORIZONTAL_PADDING * 2;
const CARD_MIN_HEIGHT = 280;

const getActiveMarketsWithImages = (markets: Market[] | undefined): Market[] => {
  if (!markets || markets.length === 0) return [];
  return markets
    .filter((m) => {
      const status = String(m.status || "").toLowerCase();
      return status === "active" || status === "open" || status === "live";
    })
    .filter((m) => {
      if (typeof m.image_url !== "string") return false;
      if (!m.image_url.startsWith("http")) return false;
      if (m.image_url.toLowerCase().includes("kalshi-fallback-images")) return false;
      return true;
    })
    .sort((a, b) => (b.volume || 0) - (a.volume || 0));
};

const getVolumeTrend = (event: Event): "up" | "down" => {
  const volumeAll = event.volume ?? 0;
  const volume24h = event.volume24h ?? 0;

  if (volume24h <= 0) return "down";
  if (volumeAll <= 0) return "up";

  const ratio = volume24h / volumeAll;
  return ratio >= 0.1 ? "up" : "down";
};

const formatCompactNumber = (value: number | undefined | null): string => {
  if (!value || !Number.isFinite(value)) return "—";
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(0);
};

export function EventMarketImageCarousel({ items, isLoadingMore = false }: EventMarketImageCarouselProps) {
  // Filter events to only show those with at least 2 market images or an event image
  const filteredItems = items.filter((item) => {
    const marketsWithImages = getActiveMarketsWithImages(item.markets);
    return marketsWithImages.length >= 2 || !!item.imageUrl;
  });

  const renderItem = ({ item }: { item: Event }) => {
    const marketsWithImages = getActiveMarketsWithImages(item.markets);
    // Previous style: show up to 4 market images for the event.
    const topImages = marketsWithImages.slice(0, 4);
    const volumeTrend = getVolumeTrend(item);
    const isUp = volumeTrend === "up";
    const primaryVolume = item.volume24h ?? item.volume ?? 0;

    return (
      <TouchableOpacity
        className="mr-4 bg-slate-100/80 rounded-3xl px-5 py-5"
        style={{ width: CARD_WIDTH, height: "100%" }}
        activeOpacity={0.8}
        onPress={() =>
          router.push({ pathname: "/event/[ticker]", params: { ticker: item.ticker } })
        }
      >
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          {/* Heading (top center) */}
          <View className="items-center">
            <Text
              className="text-[18px] font-bold text-txt-primary text-center"
              numberOfLines={2}
            >
              {item.title}?
            </Text>
          </View>

          {/* Market image strip (center) */}
          <View className="flex-row justify-center items-center flex-1 ">
            {topImages.length >= 2 ? (
              topImages.map((m, index) => {
                // Fan out like a bouquet: slight rotation + vertical offset per index
                // Support up to 4 images with a spreading pattern
                const positions = [
                  { rotate: "-14deg", offsetY: 6 },
                  { rotate: "-6deg", offsetY: 2 },
                  { rotate: "6deg", offsetY: 2 },
                  { rotate: "14deg", offsetY: 6 },
                ] as const;

                const config = positions[index] ?? { rotate: "0deg", offsetY: 0 };

                return (
                  <View
                    key={m.ticker}
                    style={{
                      marginLeft: index === 0 ? 0 : -24,
                      borderRadius: 20,
                      overflow: "hidden",
                      borderWidth: 1,
                      borderColor: "rgba(255,255,255,0.5)",
                      width: 80,
                      height: 80,
                      transform: [
                        { rotate: config.rotate },
                        { translateY: config.offsetY },
                      ],
                    }}
                  >
                    <Image
                      source={{ uri: m.image_url! }}
                      style={{ width: "100%", height: "100%" }}
                      contentFit="cover"
                      transition={150}
                    />
                  </View>
                );
              })
            ) : item.imageUrl && topImages.length < 2 ? (
              <View
                style={{
                  borderRadius: 24,
                  overflow: "hidden",
                  borderWidth: 1,
                  borderColor: "rgba(255,255,255,0.5)",
                  width: CARD_WIDTH * 0.7,
                  height: 120,
                }}
              >
                <Image
                  source={{ uri: item.imageUrl }}
                  style={{ width: "100%", height: "100%" }}
                  contentFit="cover"
                  transition={200}
                />
              </View>
            ) : null}
          </View>

          {/* Volume pill + count (bottom right) */}
          <View className="pt-2 flex-row items-center justify-end">
            <View className="flex-row items-center px-3 py-1 rounded-full bg-app-elevated">
              <Ionicons
                name={isUp ? "caret-up-outline" : "caret-down-outline"}
                size={18}
                color={isUp ? Theme.success : Theme.error}
              />
              <Text
                className="ml-1 text-[16px] font-semibold"
                style={{ color: isUp ? Theme.success : Theme.error }}
              >
                {isUp ? "Vol up" : "Vol down"}
              </Text>
            </View>
            <Text className="ml-2 text-[16px] text-black">
              {formatCompactNumber(primaryVolume)} vol
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (!filteredItems || filteredItems.length === 0) {
    if (!isLoadingMore) return null;
    return (
      <View className="pt-4 mb-4 px-5">
        <View className="bg-slate-100/80 rounded-3xl px-5 py-5 h-[120px] items-center justify-center">
          <ActivityIndicator size="small" color={Theme.textSecondary} />
          <Text className="mt-2 text-sm text-txt-secondary">Loading more events...</Text>
        </View>
      </View>
    );
  }

  return (
    <View className="pt-4 mb-4" style={{ height: CARD_MIN_HEIGHT + 24 }}>
      <FlatList
        data={filteredItems}
        keyExtractor={(item) => item.ticker}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          paddingHorizontal: CARD_HORIZONTAL_PADDING,
          alignItems: "stretch",
        }}
      />
      {isLoadingMore ? (
        <View className="px-5 pt-2 flex-row items-center justify-center">
          <ActivityIndicator size="small" color={Theme.textSecondary} />
          <Text className="ml-2 text-sm text-txt-secondary">Loading more events...</Text>
        </View>
      ) : null}
    </View>
  );
}

