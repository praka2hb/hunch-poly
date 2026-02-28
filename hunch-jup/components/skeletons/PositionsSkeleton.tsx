import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function PositionsSkeleton() {
  return (
    <View className="p-4">
      {[1, 2, 3].map((i) => (
        <View key={i} className="p-4 rounded-2xl bg-slate-100/60 mb-2">
          <View className="flex-row items-center gap-3 mb-3">
            <Skeleton width={48} height={48} borderRadius={12} />
            <View className="flex-1 gap-2">
              <Skeleton width="80%" height={16} />
              <Skeleton width="60%" height={14} />
            </View>
          </View>
          <View className="flex-row justify-between mt-2">
            <Skeleton width={60} height={20} borderRadius={4} />
            <Skeleton width={80} height={20} borderRadius={4} />
          </View>
        </View>
      ))}
    </View>
  );
}
