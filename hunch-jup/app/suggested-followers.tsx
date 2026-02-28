import { SuggestedFollowersSkeleton } from "@/components/skeletons";
import { useUser } from "@/contexts/UserContext";
import { api } from "@/lib/api";
import { User } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function SuggestedFollowersScreen() {
    const router = useRouter();
    const { backendUser, setBackendUser } = useUser();
    const [topUsers, setTopUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
    const hasNavigatedRef = useRef(false);

    useEffect(() => {
        loadTopUsers();
    }, [backendUser?.id]);

    const loadTopUsers = async () => {
        try {
            // Fetch top users and current user's following list in parallel
            const [users, currentFollowing] = await Promise.all([
                api.getTopUsers('followers', 4),
                backendUser?.id ? api.getFollowing(backendUser.id) : Promise.resolve([])
            ]);

            // Filter out current user
            const filteredUsers = users.filter(u => u.id !== backendUser?.id);
            setTopUsers(filteredUsers.slice(0, 4));

            // Set initial following state based on who user already follows
            const followingSet = new Set(currentFollowing.map(f => f.followingId));
            setFollowingIds(followingSet);
        } catch (error) {
            console.error("Failed to load top users:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleFollow = async (userId: string) => {
        if (!backendUser?.id) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

        // Optimistic update - immediately update UI
        const wasFollowing = followingIds.has(userId);
        if (wasFollowing) {
            setFollowingIds(prev => {
                const next = new Set(prev);
                next.delete(userId);
                return next;
            });
        } else {
            setFollowingIds(prev => new Set(prev).add(userId));
        }

        // Fire API request in background (no loading state)
        try {
            if (wasFollowing) {
                await api.unfollowUser(userId);
            } else {
                await api.followUser(userId);
            }
        } catch (error) {
            console.error("Failed to follow/unfollow:", error);
            // Revert on error
            if (wasFollowing) {
                setFollowingIds(prev => new Set(prev).add(userId));
            } else {
                setFollowingIds(prev => {
                    const next = new Set(prev);
                    next.delete(userId);
                    return next;
                });
            }
        }
    };

    // Navigate forward only once
    const navigateForward = () => {
        if (hasNavigatedRef.current) return;
        hasNavigatedRef.current = true;
        router.replace("/(tabs)");
    };

    const handleContinue = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        // Navigate immediately
        navigateForward();

        // Mark onboarding as complete in background
        if (backendUser?.id) {
            // Update context immediately
            await setBackendUser({ ...backendUser, hasCompletedOnboarding: true, onboardingStep: 'COMPLETE' });
            
            // Save to backend in background
            api.saveOnboardingProgress({ step: "COMPLETE", completed: true }).catch(error => {
                console.error('Failed to save onboarding completion:', error);
            });
        }
    };

    const hasFollowedSomeone = followingIds.size > 0;

    return (
        <View className="flex-1 bg-white">
            <SafeAreaView className="flex-1">
                <View className="flex-1 px-6 pt-10">
                    <Text className="text-sm text-gray-400 mb-2 tracking-wide">
                        STEP 4
                    </Text>
                    <Text className="text-3xl font-bold text-gray-900 mb-2">
                        Follow Top Traders
                    </Text>
                    <Text className="text-lg text-gray-400 mb-8">
                        See what the community is trading
                    </Text>

                    {/* Users List */}
                    {loading ? (
                        <SuggestedFollowersSkeleton />
                    ) : topUsers.length === 0 ? (
                        <View className="flex-1 items-center justify-center">
                            <Text className="text-gray-400 text-center">
                                No traders to show right now
                            </Text>
                        </View>
                    ) : (
                        <View className="flex-1">
                            {topUsers.map((user) => {
                                const isFollowing = followingIds.has(user.id);

                                return (
                                    <View
                                        key={user.id}
                                        className="py-4 flex-row items-center border-b border-gray-100"
                                    >
                                        {/* Avatar */}
                                        {user.avatarUrl ? (
                                            <Image
                                                source={{ uri: user.avatarUrl }}
                                                className="w-12 h-12 rounded-full"
                                                style={{ backgroundColor: '#F3F4F6' }}
                                            />
                                        ) : (
                                            <View className="w-12 h-12 rounded-full bg-gray-100 items-center justify-center">
                                                <Text className="text-gray-500 text-lg font-semibold">
                                                    {(user.displayName || user.walletAddress)?.[0]?.toUpperCase() || '?'}
                                                </Text>
                                            </View>
                                        )}

                                        {/* User Info */}
                                        <View className="flex-1 ml-4">
                                            <Text className="text-gray-900 font-semibold text-base" numberOfLines={1}>
                                                {user.displayName || `${user.walletAddress.slice(0, 4)}...${user.walletAddress.slice(-4)}`}
                                            </Text>
                                            <Text className="text-gray-400 text-sm mt-0.5">
                                                {user.followerCount} followers
                                            </Text>
                                        </View>

                                        {/* Follow Button */}
                                        <TouchableOpacity
                                            onPress={() => handleFollow(user.id)}
                                            activeOpacity={0.7}
                                        >
                                            <View
                                                className={`px-5 py-2 rounded-full ${isFollowing
                                                    ? 'bg-gray-100'
                                                    : 'bg-gray-900'
                                                    }`}
                                            >
                                                <Text
                                                    className={`font-medium ${isFollowing ? 'text-gray-600' : 'text-white'
                                                        }`}
                                                >
                                                    {isFollowing ? 'Following' : 'Follow'}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Fixed Bottom Button */}
                <View
                    className="px-6 pb-10 pt-6 bg-white"
                    style={{
                        borderTopWidth: 1,
                        borderTopColor: '#F3F4F6',
                    }}
                >
                    <TouchableOpacity
                        onPress={handleContinue}
                        activeOpacity={0.8}
                        className={`rounded-full py-4 flex-row items-center justify-center ${hasFollowedSomeone ? 'bg-[#FEEC28]' : 'bg-gray-200'
                            }`}
                    >
                        <Text className={`text-lg font-semibold ${hasFollowedSomeone ? 'text-gray-900' : 'text-gray-500'
                            }`}>
                            {hasFollowedSomeone ? "Continue" : "Skip"}
                        </Text>
                        <Ionicons
                            name="arrow-forward"
                            size={20}
                            color={hasFollowedSomeone ? "#111827" : "#6B7280"}
                            style={{ marginLeft: 8 }}
                        />
                    </TouchableOpacity>
                </View>
            </SafeAreaView>
        </View>
    );
}
