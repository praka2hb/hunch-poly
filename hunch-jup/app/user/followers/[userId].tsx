import CopySettingsModal from '@/components/CopySettingsModal';
import { FollowersSkeleton } from '@/components/skeletons';
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { useCopyTrading } from '@/hooks/useCopyTrading';
import { api } from "@/lib/api";
import { Follow, User } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, FlatList, Image, PanResponder, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const defaultProfileImage = require("@/assets/default.jpeg");

type TabType = 'followers' | 'following';

interface UserItem {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
    followerCount?: number;
    followingCount?: number;
}

// User row component
const UserRow = ({
    item,
    isFollowing,
    inProgress,
    isSelf,
    isCopying,
    onFollow,
    onCopyClick,
    onPress
}: {
    item: UserItem;
    isFollowing: boolean;
    inProgress: boolean;
    isSelf: boolean;
    isCopying: boolean;
    onFollow: () => void;
    onCopyClick: () => void;
    onPress: () => void;
}) => {
    const displayName = item.displayName || `${item.walletAddress.slice(0, 6)}...${item.walletAddress.slice(-4)}`;
    const username = `@${displayName.toLowerCase().replace(/\s/g, '')}`;

    return (
        <TouchableOpacity
            className="flex-row items-center py-3 px-1 mb-1"
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View className="w-12 h-12 rounded-full bg-app-elevated justify-center items-center mr-3 overflow-hidden">
                <Image
                    source={item.avatarUrl ? { uri: item.avatarUrl } : defaultProfileImage}
                    className="w-full h-full rounded-full"
                />
            </View>
            <View className="flex-1">
                <Text className="text-[15px] font-semibold  mb-0.5">{displayName}</Text>
            </View>
            {!isSelf && (
                <View className="flex-row gap-2">
                    {/* Follow Button */}
                    <TouchableOpacity
                        className={`py-2 px-5 rounded-xl min-w-[100px] items-center justify-center ${isFollowing ? 'bg-slate-200  ' : 'bg-txt-primary'
                            } ${inProgress ? 'opacity-60' : ''}`}
                        onPress={(e) => { e.stopPropagation(); onFollow(); }}
                        disabled={inProgress}
                    >
                        {inProgress ? (
                            <ActivityIndicator size="small" color={Theme.textPrimary} />
                        ) : (
                            <Text
                                className={`text-[13px] ${isFollowing ? 'font-lg text-txt-primary ' : 'font-semibold text-txt-inverse'}`}
                            >
                                {isFollowing ? "Following" : "Follow"}
                            </Text>
                        )}
                    </TouchableOpacity>
                </View>
            )}
        </TouchableOpacity>
    );
};

export default function FollowersFollowingScreen() {
    const { userId, tab } = useLocalSearchParams<{ userId: string; tab?: string }>();
    const { backendUser } = useUser();

    const [activeTab, setActiveTab] = useState<TabType>((tab as TabType) || 'followers');
    const [viewedUser, setViewedUser] = useState<User | null>(null);
    const [followers, setFollowers] = useState<UserItem[]>([]);
    const [following, setFollowing] = useState<UserItem[]>([]);
    const [loadingFollowers, setLoadingFollowers] = useState(true);
    const [loadingFollowing, setLoadingFollowing] = useState(true);
    const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
    const [followingInProgress, setFollowingInProgress] = useState<Set<string>>(new Set());

    // Copy trading state
    const { copySettings, fetchAllCopySettings } = useCopyTrading();
    const [copyingLeaderIds, setCopyingLeaderIds] = useState<Set<string>>(new Set());
    const [selectedLeaderForCopy, setSelectedLeaderForCopy] = useState<UserItem | null>(null);
    const [copyModalVisible, setCopyModalVisible] = useState(false);

    const initialTab = (tab as TabType) || 'followers';
    const slideAnim = useRef(new Animated.Value(initialTab === 'following' ? -SCREEN_WIDTH : 0)).current;
    const activeTabRef = useRef<TabType>(initialTab);

    const animateToTab = useCallback((toTab: TabType) => {
        const toValue = toTab === 'followers' ? 0 : -SCREEN_WIDTH;
        Animated.spring(slideAnim, {
            toValue,
            useNativeDriver: true,
            tension: 80,
            friction: 12,
        }).start();
        activeTabRef.current = toTab;
        setActiveTab(toTab);
    }, [slideAnim]);

    const panResponder = useRef(
        PanResponder.create({
            onMoveShouldSetPanResponder: (_, gestureState) =>
                Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 15,
            onPanResponderMove: (_, gestureState) => {
                const currentOffset = activeTabRef.current === 'followers' ? 0 : -SCREEN_WIDTH;
                const newValue = currentOffset + gestureState.dx;
                slideAnim.setValue(Math.max(-SCREEN_WIDTH, Math.min(0, newValue)));
            },
            onPanResponderRelease: (_, gestureState) => {
                const threshold = SCREEN_WIDTH * 0.25;
                if (activeTabRef.current === 'followers') {
                    if (gestureState.dx < -threshold || (gestureState.dx < 0 && gestureState.vx < -0.5)) {
                        animateToTab('following');
                    } else {
                        animateToTab('followers');
                    }
                } else {
                    if (gestureState.dx > threshold || (gestureState.dx > 0 && gestureState.vx > 0.5)) {
                        animateToTab('followers');
                    } else {
                        animateToTab('following');
                    }
                }
            },
        })
    ).current;

    const loadedTabsRef = useRef<Set<TabType>>(new Set());

    useEffect(() => {
        if (!userId) return;
        loadedTabsRef.current = new Set();
        loadViewedUser();
        const tab = (initialTab as TabType) || 'followers';
        if (tab === 'followers') {
            loadFollowers();
            loadedTabsRef.current.add('followers');
        } else {
            loadFollowing();
            loadedTabsRef.current.add('following');
        }
        if (backendUser) {
            loadMyFollowingList();
            loadCopySettings();
        }
    }, [userId, backendUser]);

    useEffect(() => {
        const tab = activeTab;
        if (loadedTabsRef.current.has(tab)) return;
        loadedTabsRef.current.add(tab);
        if (tab === 'followers') loadFollowers();
        else loadFollowing();
    }, [activeTab]);

    const loadCopySettings = async () => {
        if (!backendUser) return;
        try {
            const settings = await fetchAllCopySettings();
            setCopyingLeaderIds(new Set(settings.map(s => s.leaderId)));
        } catch (error) {
            console.error('Failed to load copy settings:', error);
        }
    };

    const loadViewedUser = async () => {
        try {
            const data = await api.getUser(userId as string);
            setViewedUser(data);
        } catch (err) {
            console.error("Failed to fetch viewed user:", err);
        }
    };

    const loadFollowers = async () => {
        try {
            setLoadingFollowers(true);
            const data = await api.getFollowers(userId as string);
            setFollowers(data.map((f: Follow) => ({
                id: f.follower.id,
                displayName: f.follower.displayName,
                avatarUrl: f.follower.avatarUrl,
                walletAddress: f.follower.walletAddress,
            })));
        } catch (err) {
            console.error("Failed to fetch followers:", err);
        } finally {
            setLoadingFollowers(false);
        }
    };

    const loadFollowing = async () => {
        try {
            setLoadingFollowing(true);
            const data = await api.getFollowing(userId as string);
            setFollowing(data.map((f: Follow) => ({
                id: f.following.id,
                displayName: f.following.displayName,
                avatarUrl: f.following.avatarUrl,
                walletAddress: f.following.walletAddress,
            })));
        } catch (err) {
            console.error("Failed to fetch following:", err);
        } finally {
            setLoadingFollowing(false);
        }
    };

    const loadMyFollowingList = async () => {
        if (!backendUser) return;
        try {
            const data = await api.getFollowing(backendUser.id);
            setFollowingIds(new Set(data.map(f => f.followingId)));
        } catch (error) {
            console.error("Failed to load following list:", error);
        }
    };

    const handleFollowUser = async (targetUserId: string) => {
        if (!backendUser || followingInProgress.has(targetUserId)) return;
        setFollowingInProgress(prev => new Set([...prev, targetUserId]));
        try {
            if (followingIds.has(targetUserId)) {
                await api.unfollowUser(targetUserId);
                setFollowingIds(prev => { const s = new Set(prev); s.delete(targetUserId); return s; });
            } else {
                await api.followUser(targetUserId);
                setFollowingIds(prev => new Set([...prev, targetUserId]));
            }
        } catch (error) {
            console.error("Failed to follow/unfollow user:", error);
        } finally {
            setFollowingInProgress(prev => { const s = new Set(prev); s.delete(targetUserId); return s; });
        }
    };

    return (
        <View className="flex-1 bg-app-bg pt-4">
            <SafeAreaView className="flex-1">
                {/* Viewed user */}
                <View className="px-5 pb-2">
                    <Text className="text-lg font-semibold text-txt-primary">
                        {viewedUser?.displayName || viewedUser?.walletAddress?.slice(0, 6) || 'User'}
                    </Text>
                </View>

                {/* Tab Header */}
                <View className="flex-row px-5 pt-2 border-b border-border">
                    <TouchableOpacity className="flex-1 items-center pb-3 relative" onPress={() => animateToTab('followers')}>
                        <Text className={`text-base font-bold mb-0.5 ${activeTab === 'followers' ? 'text-txt-primary' : 'text-txt-disabled'}`}>
                            {followers.length}
                        </Text>
                        <Text className={`text-[13px] font-medium ${activeTab === 'followers' ? 'text-txt-secondary' : 'text-txt-disabled'}`}>
                            Followers
                        </Text>
                        {activeTab === 'followers' && <View className="absolute bottom-0 left-0 right-0 h-0.5 bg-txt-primary" />}
                    </TouchableOpacity>
                    <TouchableOpacity className="flex-1 items-center pb-3 relative" onPress={() => animateToTab('following')}>
                        <Text className={`text-base font-bold mb-0.5 ${activeTab === 'following' ? 'text-txt-primary' : 'text-txt-disabled'}`}>
                            {following.length}
                        </Text>
                        <Text className={`text-[13px] font-medium ${activeTab === 'following' ? 'text-txt-secondary' : 'text-txt-disabled'}`}>
                            Following
                        </Text>
                        {activeTab === 'following' && <View className="absolute bottom-0 left-0 right-0 h-0.5 bg-txt-primary" />}
                    </TouchableOpacity>
                </View>

                {/* Sliding Lists */}
                <View {...panResponder.panHandlers} style={styles.listContainer}>
                    <Animated.View style={[styles.slidingContainer, { transform: [{ translateX: slideAnim }] }]}>
                        {/* Followers */}
                        <View style={styles.listPane}>
                            {loadingFollowers ? (
                                <FollowersSkeleton />
                            ) : followers.length === 0 ? (
                                <View className="flex-1 justify-center items-center px-10 gap-3">
                                    <Ionicons name="people-outline" size={48} color={Theme.textDisabled} />
                                    <Text className="text-sm text-txt-disabled text-center">No followers yet</Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={followers}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <UserRow
                                            item={item}
                                            isFollowing={followingIds.has(item.id)}
                                            inProgress={followingInProgress.has(item.id)}
                                            isSelf={backendUser?.id === item.id}
                                            isCopying={copyingLeaderIds.has(item.id)}
                                            onFollow={() => handleFollowUser(item.id)}
                                            onCopyClick={() => {
                                                setSelectedLeaderForCopy(item);
                                                setCopyModalVisible(true);
                                            }}
                                            onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: item.id } })}
                                        />
                                    )}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
                                />
                            )}
                        </View>

                        {/* Following */}
                        <View style={styles.listPane}>
                            {loadingFollowing ? (
                                <FollowersSkeleton />
                            ) : following.length === 0 ? (
                                <View className="flex-1 justify-center items-center px-10 gap-3">
                                    <Ionicons name="person-add-outline" size={48} color={Theme.textDisabled} />
                                    <Text className="text-sm text-txt-disabled text-center">Not following anyone yet</Text>
                                </View>
                            ) : (
                                <FlatList
                                    data={following}
                                    keyExtractor={(item) => item.id}
                                    renderItem={({ item }) => (
                                        <UserRow
                                            item={item}
                                            isFollowing={followingIds.has(item.id)}
                                            inProgress={followingInProgress.has(item.id)}
                                            isSelf={backendUser?.id === item.id}
                                            isCopying={copyingLeaderIds.has(item.id)}
                                            onFollow={() => handleFollowUser(item.id)}
                                            onCopyClick={() => {
                                                setSelectedLeaderForCopy(item);
                                                setCopyModalVisible(true);
                                            }}
                                            onPress={() => router.push({ pathname: '/user/[userId]', params: { userId: item.id } })}
                                        />
                                    )}
                                    showsVerticalScrollIndicator={false}
                                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 16, paddingBottom: 40 }}
                                />
                            )}
                        </View>
                    </Animated.View>
                </View>
            </SafeAreaView>

            {/* Copy Settings Modal */}
            <CopySettingsModal
                isOpen={copyModalVisible}
                onClose={() => {
                    setCopyModalVisible(false);
                    setSelectedLeaderForCopy(null);
                }}
                leaderId={selectedLeaderForCopy?.id || ''}
                leaderName={selectedLeaderForCopy?.displayName || ''}
                onSave={() => {
                    loadCopySettings();
                    setCopyModalVisible(false);
                    setSelectedLeaderForCopy(null);
                }}
            />
        </View>
    );
}

// Minimal styles for animated sliding container
const styles = StyleSheet.create({
    listContainer: {
        flex: 1,
        overflow: 'hidden',
    },
    slidingContainer: {
        flexDirection: 'row',
        width: SCREEN_WIDTH * 2,
        flex: 1,
    },
    listPane: {
        width: SCREEN_WIDTH,
        flex: 1,
    },
});
