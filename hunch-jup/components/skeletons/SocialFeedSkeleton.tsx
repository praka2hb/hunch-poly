import { Skeleton } from "@/components/Skeleton";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function SocialFeedSkeleton() {
  return (
    <View className="flex-1 px-4 pt-4">
      {/* Tab pills */}
      <View className="flex-row gap-3 mb-6">
        <Skeleton width={80} height={36} borderRadius={999} />
        <Skeleton width={90} height={36} borderRadius={999} />
      </View>

      {/* Feed cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} className="mb-4 p-4 rounded-2xl bg-slate-100/40">
          <View className="flex-row items-center gap-3 mb-4">
            <Skeleton width={44} height={44} borderRadius={999} />
            <View className="flex-1 gap-2">
              <Skeleton width={120} height={16} borderRadius={4} />
              <Skeleton width={80} height={12} borderRadius={4} />
            </View>
          </View>
          <Skeleton width="95%" height={18} borderRadius={4} className="mb-3" />
          <Skeleton width={SCREEN_WIDTH - 72} height={120} borderRadius={12} className="mb-3" />
          <View className="flex-row gap-4">
            <Skeleton width={60} height={16} borderRadius={4} />
            <Skeleton width={60} height={16} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}
