import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function SuggestedFollowersSkeleton() {
  return (
    <View className="flex-1 px-6 pt-10">
      <Skeleton width={200} height={36} borderRadius={6} className="mb-2" />
      <Skeleton width={260} height={24} borderRadius={4} className="mb-8" />

      {[1, 2, 3, 4].map((i) => (
        <View key={i} className="py-4 flex-row items-center border-b border-slate-100">
          <Skeleton width={48} height={48} borderRadius={999} className="mr-3" />
          <View className="flex-1 gap-2">
            <Skeleton width={120} height={18} borderRadius={4} />
            <Skeleton width={80} height={14} borderRadius={4} />
          </View>
          <Skeleton width={100} height={36} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}
