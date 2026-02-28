import { Skeleton } from "@/components/Skeleton";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

interface HomeFeedSkeletonProps {
  showFilters?: boolean;
}

export function HomeFeedSkeleton({ showFilters = true }: HomeFeedSkeletonProps = {}) {
  return (
    <View className="flex-1 px-5">
      {/* Filter pills */}
      {showFilters && (
        <View className="flex-row gap-2 mb-4 overflow-hidden">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={60 + i * 15} height={36} borderRadius={999} />
          ))}
        </View>
      )}

      {/* Event carousel */}
      <View className="mb-5">
        <Skeleton width={SCREEN_WIDTH - 40} height={200} borderRadius={24} />
      </View>

      {/* Market rail placeholder */}
      <View className="mb-5">
        <Skeleton width={120} height={24} borderRadius={4} className="mb-3" />
        <View className="flex-row gap-3">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} width={100} height={80} borderRadius={12} />
          ))}
        </View>
      </View>

      {/* Market cards */}
      {[1, 2, 3, 4].map((i) => (
        <View key={i} className="flex-row items-center mx-0 mb-3 p-4 gap-4 rounded-2xl bg-slate-100/40">
          <Skeleton width={72} height={72} borderRadius={12} />
          <View className="flex-1 gap-2">
            <Skeleton width="90%" height={16} />
            <Skeleton width="70%" height={14} />
          </View>
          <Skeleton width={48} height={28} borderRadius={6} />
        </View>
      ))}
    </View>
  );
}
