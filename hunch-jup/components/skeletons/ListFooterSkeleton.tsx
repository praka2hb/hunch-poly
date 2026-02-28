import { Skeleton } from "@/components/Skeleton";
import { View } from "react-native";

export function ListFooterSkeleton() {
  return (
    <View className="py-4 items-center">
      <Skeleton width={24} height={24} borderRadius={12} />
    </View>
  );
}
