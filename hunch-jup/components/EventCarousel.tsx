import { Theme } from "@/constants/theme";
import { formatPercent } from "@/lib/marketUtils";
import { Event, Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { FlatList, Text, TouchableOpacity, View } from "react-native";

const getTopMarketByVolume = (markets: Market[] | undefined): Market | null => {
  if (!markets || markets.length === 0) return null;
  const activeMarkets = markets.filter((market) => market.status === "active");
  if (activeMarkets.length === 0) return null;
  return (
    activeMarkets
      .slice()
      .sort((a, b) => (b.volume || 0) - (a.volume || 0))[0] || null
  );
};

interface EventCarouselProps {
  items: Event[];
}

export function EventCarousel({ items }: EventCarouselProps) {
  const renderEventItem = ({ item }: { item: Event }) => {
    const topMarket = getTopMarketByVolume(item.markets);
    return (
      <TouchableOpacity
        className="w-[220px] mr-3 bg-app-card rounded-xl overflow-hidden"
        activeOpacity={0.7}
        onPress={() =>
          router.push({ pathname: "/event/[ticker]", params: { ticker: item.ticker } })
        }
      >
        {item.imageUrl ? (
          <Image
            source={{ uri: item.imageUrl }}
            style={{ width: "100%", height: 110 }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <View className="w-full h-[110px] bg-app-card justify-center items-center">
            <Ionicons name="image-outline" size={22} color={Theme.textDisabled} />
          </View>
        )}
        <View className="px-3 py-3">
          <Text
            className="text-[14px] font-semibold text-txt-primary"
            numberOfLines={2}
          >
            {item.title}
          </Text>
          {topMarket && (
            <View className="flex-row items-center justify-between mt-1">
              <Text
                className="text-[12px] text-txt-secondary flex-1 mr-2"
                numberOfLines={1}
              >
                {topMarket.yesSubTitle || topMarket.title}
              </Text>
              <Text className="text-[12px] font-bold text-txt-primary">
                {formatPercent(topMarket.yesBid)}
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View className="py-4">
      <View className="px-5 mb-2">
        <Text className="text-[14px] font-semibold text-txt-primary">
          Events
        </Text>
      </View>
      <FlatList
        data={items}
        keyExtractor={(item) => item.ticker}
        renderItem={renderEventItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 20 }}
      />
    </View>
  );
}
