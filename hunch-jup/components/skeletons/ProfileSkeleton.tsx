import { Skeleton } from "@/components/Skeleton";
import { Dimensions, View } from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const CARD_WIDTH = SCREEN_WIDTH - 60;

export function ProfileSkeleton() {
  return (
    <View className="flex-1 px-5 pt-4">
      {/* Menu button */}
      <View className="items-end mb-5">
        <Skeleton width={30} height={30} borderRadius={4} />
      </View>

      {/* Avatar + Info */}
      <View className="flex-row items-start gap-4 pt-4 mb-6">
        <Skeleton width={56} height={56} borderRadius={999} />
        <View className="flex-1 pt-1 gap-3">
          <Skeleton width={140} height={24} borderRadius={6} />
          <View className="flex-row gap-5">
            <Skeleton width={80} height={20} borderRadius={4} />
            <Skeleton width={80} height={20} borderRadius={4} />
          </View>
        </View>
        <Skeleton width={90} height={36} borderRadius={8} />
      </View>

      {/* Credit card */}
      <View className="my-3 items-center">
        <Skeleton width={CARD_WIDTH} height={180} borderRadius={20} />
      </View>

      {/* Tabs */}
      <View className="flex-row border-b border-slate-200 pb-1 mb-4">
        <Skeleton width={120} height={24} borderRadius={4} className="mx-4" />
        <Skeleton width={100} height={24} borderRadius={4} />
      </View>

      {/* Active/Previous pills */}
      <View className="flex-row gap-2 mb-4">
        <Skeleton width={70} height={36} borderRadius={999} />
        <Skeleton width={85} height={36} borderRadius={999} />
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
