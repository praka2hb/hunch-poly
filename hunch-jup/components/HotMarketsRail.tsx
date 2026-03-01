/**
 * HotMarketsRail — horizontal scrolling row of top markets from Hot events.
 * Placed below EventMarketImageCarousel on the Home screen.
 * Tapping a card opens the MarketTradeSheet.
 */
import { Theme } from '@/constants/theme';
import { Market } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import {
    Dimensions,
    FlatList,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = Math.floor(SCREEN_WIDTH * 0.44);

interface HotMarketsRailProps {
    markets: Market[];
    onMarketPress: (market: Market) => void;
    eventTitleByTicker?: Map<string, string>;
}

const getYesPercent = (market: Market): number | null => {
    // Try yesBid first (comes from Dome API best prices mapped in api.ts)
    if (market.yesBid != null) {
        const bid = parseFloat(String(market.yesBid));
        if (!isNaN(bid)) return Math.round(bid * 100);
    }
    return null;
};


const MarketCard = ({
    market,
    onPress,
    eventTitle,
}: {
    market: Market;
    onPress: () => void;
    eventTitle?: string;
}) => {
    const imageUrl = market.image_url || market.image;
    const yesPercent = getYesPercent(market);

    return (
        <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.85}>
            {/* Market image */}
            {imageUrl ? (
                <Image
                    source={{ uri: imageUrl }}
                    style={styles.cardImage}
                    contentFit="cover"
                    transition={150}
                />
            ) : (
                <View style={[styles.cardImage, styles.cardImageFallback]}>
                    <Ionicons name="stats-chart" size={22} color={Theme.textDisabled} />
                </View>
            )}

            {/* Content */}
            <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                    {market.title}
                </Text>

                {yesPercent !== null && (
                    <View style={styles.probRow}>
                        <View
                            style={[
                                styles.probPill,
                                { backgroundColor: yesPercent >= 50 ? Theme.success + '22' : Theme.error + '22' },
                            ]}
                        >
                            <Text
                                style={[
                                    styles.probText,
                                    { color: yesPercent >= 50 ? Theme.success : Theme.error },
                                ]}
                            >
                                {yesPercent}% Yes
                            </Text>
                        </View>
                    </View>
                )}
            </View>
        </TouchableOpacity>
    );
};

export function HotMarketsRail({
    markets,
    onMarketPress,
    eventTitleByTicker,
}: HotMarketsRailProps) {
    if (!markets || markets.length === 0) return null;

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <View style={styles.hotBadge}>
                    <Text style={styles.hotBadgeText}>🔥 Hot Markets</Text>
                </View>
            </View>

            <FlatList
                horizontal
                data={markets}
                keyExtractor={(m) => m.ticker || m.condition_id || m.market_slug}
                renderItem={({ item }) => (
                    <MarketCard
                        market={item}
                        onPress={() => onMarketPress(item)}
                        eventTitle={
                            item.eventTicker ? eventTitleByTicker?.get(item.eventTicker) : undefined
                        }
                    />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.listContent}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        marginBottom: 12,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        marginBottom: 10,
    },
    hotBadge: {
        backgroundColor: Theme.accent || '#FF6B35',
        paddingHorizontal: 12,
        paddingVertical: 4,
        borderRadius: 20,
    },
    hotBadgeText: {
        color: '#fff',
        fontSize: 13,
        fontWeight: '700',
    },
    listContent: {
        paddingHorizontal: 16,
        gap: 10,
    },
    card: {
        width: CARD_WIDTH,
        backgroundColor: Theme.bgCard,
        borderRadius: 16,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.06)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.07,
        shadowRadius: 8,
        elevation: 3,
    },
    cardImage: {
        width: '100%',
        height: 90,
    },
    cardImageFallback: {
        backgroundColor: Theme.bgElevated || '#f0f0f5',
        justifyContent: 'center',
        alignItems: 'center',
    },
    cardContent: {
        padding: 10,
    },
    cardTitle: {
        fontSize: 13,
        fontWeight: '600',
        color: Theme.textPrimary,
        marginBottom: 6,
        lineHeight: 17,
    },
    probRow: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    probPill: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 20,
    },
    probText: {
        fontSize: 12,
        fontWeight: '700',
    },
});
