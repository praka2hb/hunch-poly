import { Theme } from '@/constants/theme';
import { EventEvidence } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH - 40;

interface MiniNewsCarouselProps {
    items: EventEvidence[];
}

const getTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const MiniNewsCard = ({ item }: { item: EventEvidence }) => {
    const publishedAt = item.sourcePublishedAt || item.createdAt;

    const handlePress = () => {
        router.push({ pathname: '/event/[ticker]', params: { ticker: item.eventTicker } });
    };

    return (
        <TouchableOpacity
            style={styles.newsCard}
            onPress={handlePress}
            activeOpacity={0.9}
        >
            {/* Signal Badge */}
            <View style={styles.signalBadge}>
                <Ionicons name="flash" size={10} color="#fff" />
                <Text style={styles.signalText}>NEWS</Text>
            </View>

            {/* Headline */}
            <Text style={styles.headline} numberOfLines={2}>
                {item.headline || item.evidenceSentence}
            </Text>

            {/* Footer */}
            <View style={styles.footer}>
                <Text style={styles.timeText}>{getTimeAgo(publishedAt)}</Text>
                <View style={styles.tradeButton}>
                    <Text style={styles.tradeButtonText}>View Event</Text>
                    <Ionicons name="chevron-forward" size={14} color={Theme.textPrimary} />
                </View>
            </View>
        </TouchableOpacity>
    );
};

export const MiniNewsCarousel = ({ items }: MiniNewsCarouselProps) => {
    if (!items || items.length === 0) return null;

    return (
        <View style={styles.container}>
            {/* Section Header */}
            <View style={styles.header}>
                <Ionicons name="newspaper-outline" size={16} color={Theme.textSecondary} />
                <Text style={styles.headerText}>Latest News</Text>
            </View>

            <FlatList
                horizontal
                data={items}
                keyExtractor={(item) => item.id}
                renderItem={({ item }) => <MiniNewsCard item={item} />}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
                snapToInterval={CARD_WIDTH + 12}
                decelerationRate="fast"
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 16,
        backgroundColor: Theme.bgCard,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        marginBottom: 12,
        gap: 6,
    },
    headerText: {
        fontSize: 13,
        fontWeight: '600',
        color: Theme.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    listContent: {
        paddingHorizontal: 20,
        gap: 12,
    },
    newsCard: {
        width: CARD_WIDTH,
        backgroundColor: Theme.bgCard,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    signalBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Theme.textPrimary,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 12,
        alignSelf: 'flex-start',
        gap: 4,
        marginBottom: 10,
    },
    signalText: {
        fontSize: 10,
        fontWeight: '700',
        color: '#fff',
        letterSpacing: 0.5,
    },
    headline: {
        fontSize: 16,
        fontWeight: '700',
        color: Theme.textPrimary,
        lineHeight: 22,
        marginBottom: 12,
    },
    footer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: Theme.border,
    },
    timeText: {
        fontSize: 12,
        color: Theme.textDisabled,
    },
    tradeButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    tradeButtonText: {
        fontSize: 13,
        fontWeight: '600',
        color: Theme.textPrimary,
    },
});

export default MiniNewsCarousel;
