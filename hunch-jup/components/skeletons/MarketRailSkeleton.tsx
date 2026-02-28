import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function MarketRailSkeleton() {
  return (
    <View className="py-5 px-4">
      <View className="flex-row gap-3 overflow-hidden">
        {[1, 2, 3, 4].map((i) => (
          <View key={i} className="items-center gap-2">
            <Skeleton width={100} height={60} borderRadius={12} />
            <Skeleton width={70} height={14} borderRadius={4} />
            <Skeleton width={50} height={18} borderRadius={4} />
          </View>
        ))}
      </View>
    </View>
  );
}
