import { Theme } from "@/constants/theme";
import { formatPercent } from "@/lib/marketUtils";
import { Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface MarketCardProps {
  item: Market;
  onPress: () => void;
  onLongPress?: () => void;
  eventTitle?: string;
}

export function MarketCard({ item, onPress, onLongPress, eventTitle }: MarketCardProps) {
  const [imageFailed, setImageFailed] = useState(false);
  const isBadImageUrl = (url: unknown) =>
    typeof url === "string" &&
    url.toLowerCase().includes("kalshi-fallback-images");
  const isFallbackImage = isBadImageUrl((item as any).image_url);

  const question = eventTitle || item.title;
  const answer = item.yesSubTitle || item.title;
  const yesBid = item.yesBid ? parseFloat(item.yesBid) * 100 : null;
  const oddsIncreasing = yesBid !== null && yesBid >= 50;
  const oddsColor = yesBid === null ? Theme.textPrimary : oddsIncreasing ? '#32de12' : Theme.chartNegative;

  return (
    <TouchableOpacity
      className="mx-5 mb-3 rounded-2xl bg-slate-100/60 overflow-hidden"
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={400}
      style={{
        
        shadowColor: "#000000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
      }}
    >
      <View className="flex-row items-center p-4 gap-4 min-h-[100px]">
        {/* Left - Image */}
        <View
          className="w-[72px] h-[72px] rounded-xl overflow-hidden"
          style={{
            
            shadowColor: "#000000",
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.06,
            shadowRadius: 6,
            elevation: 2,
          }}
        >
          {item.image_url && !isFallbackImage && !imageFailed ? (
            <Image
              source={{ uri: item.image_url }}
              style={{ width: "100%", height: "100%" }}
              contentFit="cover"
              transition={200}
              onError={() => setImageFailed(true)}
            />
          ) : (
            <View
              style={{
                width: "100%",
                height: "100%",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Ionicons
                name="image-outline"
                size={24}
                color={Theme.textDisabled}
              />
            </View>
          )}
        </View>

        {/* Center - Question + Answer */}
        <View className="flex-1 min-w-0 justify-center py-0.5">
          <Text
            className="text-[15px] font-medium text-txt-primary leading-5"
            numberOfLines={2}
          >
            {question}
          </Text>
          <Text
            className="text-[18px] text-txt-secondary mt-4"
            numberOfLines={2}
          >
            {answer}
          </Text>
        </View>

        {/* Right - Yes odds: green if ≥50%, pink if <50% */}
        <View className="justify-center">
          <Text className="text-[24px] font-bold" style={{ color: oddsColor }}>
            {yesBid !== null ? formatPercent(item.yesBid) : "—"}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}
