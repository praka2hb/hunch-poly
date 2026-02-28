import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function FollowersSkeleton() {
  return (
    <View className="px-4 py-4">
      {[1, 2, 3, 4, 5, 6].map((i) => (
        <View key={i} className="flex-row items-center py-3 mb-1">
          <Skeleton width={48} height={48} borderRadius={999} className="mr-3" />
          <View className="flex-1 gap-2">
            <Skeleton width={140} height={16} borderRadius={4} />
          </View>
          <Skeleton width={100} height={36} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}
