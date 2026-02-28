import { Skeleton } from "@/components/Skeleton";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export function EventDetailSkeleton() {
  return (
    <View className="flex-1">
      {/* Back button */}
      <View className="px-4 pt-2 pb-4">
        <Skeleton width={40} height={40} borderRadius={20} />
      </View>

      {/* Hero image */}
      <View className="px-4 mb-4">
        <Skeleton width={SCREEN_WIDTH - 32} height={220} borderRadius={20} />
      </View>

      {/* Title */}
      <View className="px-4 mb-4">
        <Skeleton width="90%" height={28} borderRadius={6} className="mb-2" />
        <Skeleton width="60%" height={20} borderRadius={4} />
      </View>

      {/* Market cards */}
      {[1, 2, 3].map((i) => (
        <View key={i} className="flex-row items-center px-4 mb-3 gap-3">
          <Skeleton width={64} height={64} borderRadius={12} />
          <View className="flex-1 gap-2">
            <Skeleton width="85%" height={20} />
            <Skeleton width="50%" height={16} />
          </View>
          <Skeleton width={64} height={36} borderRadius={8} />
        </View>
      ))}
    </View>
  );
}
