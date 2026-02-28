import { Text, View } from "react-native";

/**
 * Test component to verify NativeWind/Tailwind CSS integration
 * Uses Tailwind utility classes for styling
 */
export default function TailwindTest() {
    return (
        <View className="flex-1 items-center justify-center bg-slate-900 p-4">
            <View className="w-full max-w-sm rounded-2xl bg-gradient-to-br from-purple-500 to-pink-500 p-6 shadow-lg">
                <Text className="text-2xl font-bold text-white mb-2">
                    🎉 Tailwind Works!
                </Text>
                <Text className="text-white/80 mb-4">
                    NativeWind is successfully integrated.
                </Text>
                <View className="flex-row gap-2">
                    <View className="flex-1 rounded-lg bg-white/20 p-3">
                        <Text className="text-white text-center font-semibold">Button 1</Text>
                    </View>
                    <View className="flex-1 rounded-lg bg-white p-3">
                        <Text className="text-purple-600 text-center font-semibold">Button 2</Text>
                    </View>
                </View>
            </View>

            {/* Additional test of various Tailwind utilities */}
            <View className="mt-6 flex-row gap-3">
                <View className="h-12 w-12 rounded-full bg-red-500" />
                <View className="h-12 w-12 rounded-full bg-yellow-500" />
                <View className="h-12 w-12 rounded-full bg-[#00e003]" />
                <View className="h-12 w-12 rounded-full bg-blue-500" />
            </View>
        </View>
    );
}
