import { EventEvidence } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Linking, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface NewsCardProps {
    item: EventEvidence;
}

const classificationConfig: Record<string, { color: string; label: string }> = {
    CONFIRMATION: { color: '#32de12', label: 'SIGNAL' },
    REQUIREMENT: { color: '#f59e0b', label: 'UPDATE' },
    DELAY: { color: '#f97316', label: 'DELAYED' },
    RISK: { color: '#FF10F0', label: 'ALERT' },
    NONE: { color: '#6b7280', label: 'NEWS' },
};

const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

export const NewsCard = ({ item }: NewsCardProps) => {
    const [menuVisible, setMenuVisible] = useState(false);
    const [expanded, setExpanded] = useState(false);
    const config = classificationConfig[item.classification] || classificationConfig.NONE;
    const publishedAt = item.sourcePublishedAt || item.createdAt;

    const sourceUrls: string[] = item.sourceUrls && Array.isArray(item.sourceUrls)
        ? item.sourceUrls
        : ((item as any).sourceUrl ? [(item as any).sourceUrl] : []);

    const handlePress = () => {
        router.push({ pathname: '/event/[ticker]', params: { ticker: item.eventTicker } });
    };

    const handleSourcePress = (url?: string) => {
        if (url) {
            Linking.openURL(url);
        }
        setMenuVisible(false);
    };

    const explanationText = item.explanation || '';
    const shouldTruncate = explanationText.length > 180 && !expanded;
    const displayText = shouldTruncate ? explanationText.substring(0, 180) + '...' : explanationText;

    return (
        <View className="mx-5 mb-5">
            {/* Header Row */}
            <View className="flex-row items-center mb-3">
                {/* Hunch Avatar - Logo */}
                <View style={styles.avatar}>
                    <Image
                        source={require('@/assets/hunch.jpg')}
                        style={{ width: 36, height: 36, borderRadius: 18 }}
                    />
                </View>

                <View className="flex-1 ml-3">
                    <View className="flex-row items-center">
                        <Text style={styles.username}>Scout</Text>
                        <Image
                            source={require('@/assets/verified.png')}
                            style={styles.verifiedBadge}
                        />
                    </View>
                </View>

                <Text style={styles.timeAgo}>{getTimeAgo(publishedAt)}</Text>
            </View>

            {/* Content Card - Light Theme */}
            <TouchableOpacity
                style={styles.contentCard}
                onPress={handlePress}
                activeOpacity={0.95}
            >
                {/* Category Badge */}
                {/* <View className="flex-row items-center mb-3">
                    <View style={[styles.categoryBadge, { backgroundColor: `${config.color}15` }]}>
                        <View style={[styles.categoryDot, { backgroundColor: config.color }]} />
                        <Text style={[styles.categoryText, { color: config.color }]}>{config.label}</Text>
                    </View>
                </View> */}

                {/* HEADLINE - Bold & Prominent */}
                <Text style={styles.headline}>
                    {item.headline || item.evidenceSentence}
                </Text>

                {/* Explanation */}
                {explanationText && (
                    <Text style={styles.explanation}>
                        {displayText}
                    </Text>
                )}

                {/* Show more or Trade */}
                <View className="flex-row items-center justify-between mt-3 pt-3" style={styles.footer}>
                    {shouldTruncate ? (
                        <TouchableOpacity onPress={() => setExpanded(true)}>
                            <Text style={styles.showMore}>Show more</Text>
                        </TouchableOpacity>
                    ) : (
                        <TouchableOpacity
                            className="flex-row items-center"
                            onPress={handlePress}
                        >
                            <Ionicons name="trending-up" size={16} color="#111827" />
                            <Text style={styles.tradeText}>Trade the News</Text>
                        </TouchableOpacity>
                    )}

                    <TouchableOpacity
                        onPress={(e) => {
                            e.stopPropagation();
                            setMenuVisible(true);
                        }}
                        className="flex-row items-center"
                    >
                        <Ionicons name="link" size={14} color="#9ca3af" />
                        <Text style={styles.sourceCount}>{sourceUrls.length} sources</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>

            {/* Source Menu Modal */}
            <Modal
                visible={menuVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setMenuVisible(false)}
            >
                <Pressable
                    className="flex-1 justify-end"
                    onPress={() => setMenuVisible(false)}
                >
                    <View style={styles.menuBackdrop} />
                    <View className="bg-white rounded-t-[24px] px-5 pb-10 pt-4">
                        <View className="w-10 h-1 rounded-full bg-[#d1d5db] self-center mb-4" />

                        <Text className="text-[13px] text-[#9ca3af] uppercase tracking-wider mb-3">
                            Sources ({sourceUrls.length})
                        </Text>

                        {sourceUrls.length === 0 ? (
                            <View className="py-3 border-b border-[#f3f4f6]">
                                <Text className="text-[15px] text-[#9ca3af]">No sources available</Text>
                            </View>
                        ) : (
                            sourceUrls.map((url, index) => (
                                <TouchableOpacity
                                    key={index}
                                    className="flex-row items-center py-3.5 border-b border-[#f3f4f6]"
                                    onPress={() => handleSourcePress(url)}
                                >
                                    <Ionicons name="globe-outline" size={20} color="#111827" />
                                    <Text className="text-[15px] text-[#111827] ml-3 flex-1" numberOfLines={1}>
                                        {url.replace(/^https?:\/\/(www\.)?/, '').split('/')[0]}
                                    </Text>
                                    <Ionicons name="open-outline" size={16} color="#9ca3af" />
                                </TouchableOpacity>
                            ))
                        )}

                        <TouchableOpacity
                            className="flex-row items-center py-3.5"
                            onPress={handlePress}
                        >
                            <Ionicons name="trending-up-outline" size={20} color="#111827" />
                            <Text className="text-[15px] text-[#111827] ml-3">Trade on this event</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            className="bg-[#111827] py-3.5 rounded-xl mt-4"
                            onPress={() => setMenuVisible(false)}
                        >
                            <Text className="text-[15px] font-semibold text-white text-center">Close</Text>
                        </TouchableOpacity>
                    </View>
                </Pressable>
            </Modal>
        </View>
    );
};

const styles = StyleSheet.create({
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: '#f3f4f6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    username: {
        fontSize: 15,
        fontWeight: '700',
        color: '#111827',
    },
    verifiedBadge: {
        width: 18,
        height: 18,
        marginLeft: 4,
    },
    timeAgo: {
        fontSize: 14,
        color: '#9ca3af',
    },
    contentCard: {
        backgroundColor: '#f9fafb', // Light grey
        borderRadius: 20,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e5e7eb',
    },
    categoryBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 20,
        alignSelf: 'flex-start',
    },
    categoryDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        marginRight: 6,
    },
    categoryText: {
        fontSize: 11,
        fontWeight: '700',
        letterSpacing: 1,
    },
    headline: {
        fontSize: 20,
        fontWeight: '700',
        color: '#111827',
        lineHeight: 26,
        marginBottom: 8,
        letterSpacing: -0.3,
    },
    explanation: {
        fontSize: 14,
        color: '#6b7280',
        lineHeight: 21,
    },
    footer: {
        borderTopWidth: 1,
        borderTopColor: '#e5e7eb',
    },
    showMore: {
        fontSize: 14,
        fontWeight: '600',
        color: '#3b82f6',
    },
    tradeText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
        marginLeft: 6,
    },
    sourceCount: {
        fontSize: 12,
        color: '#9ca3af',
        marginLeft: 4,
    },
    menuBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
});

export default NewsCard;
