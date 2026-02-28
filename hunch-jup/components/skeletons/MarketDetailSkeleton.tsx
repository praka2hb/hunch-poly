import { Skeleton } from "@/components/Skeleton";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function MarketDetailSkeleton() {
  return (
    <View className="flex-1">
      {/* Back button */}
      <View className="px-5 py-3 flex-row justify-between">
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>

      {/* Title section */}
      <View className="px-5 mb-6">
        <Skeleton width="95%" height={32} borderRadius={8} className="mb-3" />
        <Skeleton width="70%" height={20} borderRadius={4} />
      </View>

      {/* Chart area */}
      <View className="px-5 mb-6">
        <Skeleton width={SCREEN_WIDTH - 40} height={200} borderRadius={16} />
      </View>

      {/* Yes/No toggle */}
      <View className="flex-row px-5 gap-3 mb-6">
        <Skeleton width={(SCREEN_WIDTH - 52) / 2} height={48} borderRadius={12} />
        <Skeleton width={(SCREEN_WIDTH - 52) / 2} height={48} borderRadius={12} />
      </View>

      {/* Amount input */}
      <View className="px-5 mb-6">
        <Skeleton width={80} height={16} borderRadius={4} className="mb-2" />
        <Skeleton width={SCREEN_WIDTH - 40} height={56} borderRadius={12} />
      </View>

      {/* Trade button */}
      <View className="px-5">
        <Skeleton width={SCREEN_WIDTH - 40} height={52} borderRadius={14} />
      </View>
    </View>
  );
}
