import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function UserProfileSkeleton() {
  return (
    <View className="flex-1 px-5 pt-4">
      {/* Back button */}
      <View className="mb-5">
        <Skeleton width={80} height={32} borderRadius={6} />
      </View>

      {/* Profile row */}
      <View className="flex-row items-start gap-4 mb-6">
        <Skeleton width={56} height={56} borderRadius={999} />
        <View className="flex-1 pt-1 gap-3">
          <Skeleton width={160} height={24} borderRadius={6} />
          <View className="flex-row gap-5">
            <Skeleton width={90} height={20} borderRadius={4} />
            <Skeleton width={90} height={20} borderRadius={4} />
          </View>
          <Skeleton width={100} height={40} borderRadius={12} />
        </View>
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-slate-200 pb-1 mb-4">
        <Skeleton width={100} height={24} borderRadius={4} className="mx-4" />
        <Skeleton width={100} height={24} borderRadius={4} />
      </View>

      {/* Position cards */}
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
