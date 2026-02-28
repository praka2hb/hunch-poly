import { Theme } from '@/constants/theme';
import { api } from '@/lib/api';
import { Follow, Trade, User } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Image,
    SectionList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const defaultProfileImage = require('@/assets/default.jpeg');
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SIDEBAR_WIDTH = SCREEN_WIDTH;

type ActivityItem =
    | { type: 'trade'; data: Trade }
    | { type: 'follow'; data: Follow };

interface NotificationSidebarProps {
    visible: boolean;
    onClose: () => void;
    backendUser: User | null;
}

const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const groupByDate = (items: ActivityItem[]): { title: string; data: ActivityItem[] }[] => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    const groups: Record<string, ActivityItem[]> = {
        Today: [],
        Yesterday: [],
        'This Week': [],
        Earlier: [],
    };

    items.forEach((item) => {
        const date = new Date(
            item.type === 'trade' ? item.data.createdAt : item.data.createdAt
        );
        if (date >= today) groups.Today.push(item);
        else if (date >= yesterday) groups.Yesterday.push(item);
        else if (date >= thisWeek) groups['This Week'].push(item);
        else groups.Earlier.push(item);
    });

    return Object.entries(groups)
        .filter(([, items]) => items.length > 0)
        .map(([title, data]) => ({ title, data }));
};

export default function NotificationSidebar({
    visible,
    onClose,
    backendUser,
}: NotificationSidebarProps) {
    const insets = useSafeAreaInsets();
    const slideAnim = useRef(new Animated.Value(SCREEN_WIDTH)).current;
    const [isRendered, setIsRendered] = useState(false);
    const [loading, setLoading] = useState(false);
    const [activities, setActivities] = useState<ActivityItem[]>([]);

    useEffect(() => {
        if (visible) {
            setIsRendered(true);
            loadActivity();
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 65,
                friction: 11,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: SCREEN_WIDTH,
                duration: 200,
                useNativeDriver: true,
            }).start(({ finished }) => {
                if (finished) setIsRendered(false);
            });
        }
    }, [visible]);

    const loadActivity = useCallback(async () => {
        if (!backendUser) return;
        setLoading(true);
        try {
            const [trades, followers] = await Promise.all([
                api.getUserTrades(backendUser.id, 30, 0),
                api.getFollowers(backendUser.id),
            ]);

            const items: ActivityItem[] = [
                ...trades.map((t): ActivityItem => ({ type: 'trade', data: t })),
                ...followers.map((f): ActivityItem => ({ type: 'follow', data: f })),
            ];

            items.sort((a, b) => {
                const dateA = new Date(a.type === 'trade' ? a.data.createdAt : a.data.createdAt).getTime();
                const dateB = new Date(b.type === 'trade' ? b.data.createdAt : b.data.createdAt).getTime();
                return dateB - dateA;
            });

            setActivities(items);
        } catch (err) {
            console.error('Failed to load activity:', err);
        } finally {
            setLoading(false);
        }
    }, [backendUser]);

    const handleClose = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onClose();
    };

    const renderItem = ({ item }: { item: ActivityItem }) => {
        if (item.type === 'trade') {
            const trade = item.data;
            const isSell = trade.action === 'SELL';
            const isYes = trade.side === 'yes';
            const amount = parseFloat(trade.amount || '0');

            return (
                <TouchableOpacity
                    style={styles.activityRow}
                    onPress={() => {
                        onClose();
                        router.push({ pathname: '/market/[ticker]', params: { ticker: trade.marketTicker } });
                    }}
                    activeOpacity={0.7}
                >
                    <View style={[styles.iconCircle, { backgroundColor: isSell ? '#FFF0F5' : '#F0FFF4' }]}>
                        <Ionicons
                            name={isSell ? 'arrow-down' : 'arrow-up'}
                            size={18}
                            color={isSell ? '#FF10F0' : '#32de12'}
                        />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.activityTitle} numberOfLines={2}>
                            You {isSell ? 'sold' : 'bought'}{' '}
                            <Text style={{ color: isYes ? '#32de12' : '#FF10F0', fontWeight: '800' }}>
                                {isYes ? 'YES' : 'NO'}
                            </Text>
                            {' '}for ${amount.toFixed(2)}
                        </Text>
                        <Text style={styles.activityMeta} numberOfLines={1}>
                            {trade.marketTicker}
                        </Text>
                        <Text style={styles.activityTime}>{getTimeAgo(trade.createdAt)}</Text>
                    </View>
                </TouchableOpacity>
            );
        }

        const follow = item.data;
        const followerAvatar = follow.follower?.avatarUrl?.replace('_normal', '');

        return (
            <TouchableOpacity
                style={styles.activityRow}
                onPress={() => {
                    onClose();
                    router.push({ pathname: '/user/[userId]', params: { userId: follow.followerId } });
                }}
                activeOpacity={0.7}
            >
                <View style={styles.followerAvatar}>
                    <Image
                        source={followerAvatar ? { uri: followerAvatar } : defaultProfileImage}
                        style={styles.followerAvatarImage}
                    />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={styles.activityTitle} numberOfLines={2}>
                        <Text style={{ fontWeight: '700' }}>
                            {follow.follower?.displayName || 'Someone'}
                        </Text>
                        {' '}started following you
                    </Text>
                    <Text style={styles.activityTime}>{getTimeAgo(follow.createdAt)}</Text>
                </View>
            </TouchableOpacity>
        );
    };

    if (!isRendered) return null;

    const sections = groupByDate(activities);

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            {/* Full-screen sidebar */}
            <Animated.View
                style={[
                    styles.sidebar,
                    {
                        width: SIDEBAR_WIDTH,
                        paddingTop: insets.top + 8,
                        paddingBottom: insets.bottom,
                        transform: [{ translateX: slideAnim }],
                    },
                ]}
            >
                {/* Header */}
                <View style={styles.sidebarHeader}>
                    <Text style={styles.sidebarTitle}>Activity</Text>
                    <TouchableOpacity onPress={handleClose} hitSlop={12}>
                        <Ionicons name="close" size={24} color="#111827" />
                    </TouchableOpacity>
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Theme.textSecondary} />
                    </View>
                ) : activities.length === 0 ? (
                    <View style={styles.emptyContainer}>
                        <Ionicons name="notifications-outline" size={48} color="#D1D5DB" />
                        <Text style={styles.emptyText}>No activity yet</Text>
                        <Text style={styles.emptySubtext}>
                            Your trades and follows will show up here
                        </Text>
                    </View>
                ) : (
                    <SectionList
                        sections={sections}
                        keyExtractor={(item, idx) =>
                            item.type === 'trade'
                                ? `trade-${item.data.id}`
                                : `follow-${item.data.id}-${idx}`
                        }
                        renderItem={renderItem}
                        renderSectionHeader={({ section }) => (
                            <View style={styles.sectionHeader}>
                                <Text style={styles.sectionTitle}>{section.title}</Text>
                            </View>
                        )}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={{ paddingBottom: 40 }}
                        stickySectionHeadersEnabled={false}
                    />
                )}
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    sidebar: {
        position: 'absolute',
        top: 0,
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: '#FFFFFF',
        elevation: 20,
    },
    sidebarHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 16,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    sidebarTitle: {
        fontSize: 22,
        fontWeight: '800',
        color: '#111827',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    emptyContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 40,
        gap: 8,
    },
    emptyText: {
        fontSize: 17,
        fontWeight: '600',
        color: '#111827',
        marginTop: 8,
    },
    emptySubtext: {
        fontSize: 14,
        color: '#9CA3AF',
        textAlign: 'center',
    },
    sectionHeader: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 8,
    },
    sectionTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#6B7280',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    activityRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        paddingHorizontal: 20,
        paddingVertical: 12,
        gap: 12,
    },
    iconCircle: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
    },
    followerAvatar: {
        width: 40,
        height: 40,
        borderRadius: 20,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
    },
    followerAvatarImage: {
        width: 40,
        height: 40,
        borderRadius: 20,
    },
    activityTitle: {
        fontSize: 14,
        fontWeight: '500',
        color: '#111827',
        lineHeight: 20,
    },
    activityMeta: {
        fontSize: 12,
        color: '#9CA3AF',
        marginTop: 2,
    },
    activityTime: {
        fontSize: 12,
        color: '#D1D5DB',
        marginTop: 3,
    },
});
