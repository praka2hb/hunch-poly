import { Theme } from '@/constants/theme';
import { useUser } from '@/contexts/UserContext';
import { api, marketsApi } from '@/lib/api';
import { formatVolume, getMarketDisplayTitle, getScoredEventsForRail } from '@/lib/marketUtils';
import { CandleData, Event, Market } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import AnimatedPrice from './AnimatedPrice';
import { MarketRailSkeleton } from './skeletons';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH * 0.85;
const CARD_MARGIN = 8;
const CHART_HEIGHT = 100;

interface RailItem {
    event: Event;
    market: Market;
    score: number;
}

// Cache for candle data
const candleCache = new Map<string, { data: CandleData[]; timestamp: number }>();
const CANDLE_CACHE_DURATION = 2 * 60 * 1000;

const getPriceChange = (candles: CandleData[]) => {
    if (!candles || candles.length < 2) return null;
    const latest = candles[candles.length - 1];
    const first = candles[0];
    const change = latest.close - first.close;
    const changePercent = first.close > 0 ? (change / first.close) * 100 : 0;
    return {
        change,
        changePercent: changePercent.toFixed(1),
        isPositive: change >= 0,
        currentPrice: latest.close,
    };
};

// RailCard component
const RailCard = ({
    item,
    onInteractionStart,
    onInteractionEndCallback,
}: {
    item: RailItem;
    onInteractionStart?: () => void;
    onInteractionEndCallback?: () => void;
}) => {
    const { event, market } = item;
    const marketTitle = getMarketDisplayTitle(market);
    const volume = formatVolume(event.volume || event.volume24h);

    // Simple price display without chart interaction
    const basePrice = market.yesBid ? Number(market.yesBid) : 0;
    const displayPrice = basePrice * 100; // Convert to cents/percent

    const handleCardPress = () => {
        router.push({ pathname: '/event/[ticker]', params: { ticker: event.ticker } });
    };

    return (
        <TouchableOpacity style={styles.railCard} activeOpacity={0.9} onPress={handleCardPress}>
            <View className="p-4">
                {/* Header Row */}
                <View className="flex-row items-start mb-4 gap-3">
                    {event.imageUrl ? (
                        <Image
                            source={{ uri: event.imageUrl }}
                            style={{ width: 56, height: 56 }}
                            className="rounded-xl"
                            contentFit="cover"
                            transition={200}
                        />
                    ) : (
                        <View className="w-14 h-14 rounded-xl bg-app-card justify-center items-center">
                            <Ionicons name="stats-chart" size={20} color={Theme.textDisabled} />
                        </View>
                    )}
                    <View className="flex-1">
                        {event.competition && (
                            <Text className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: Theme.chartLine }}>
                                {event.competition}
                            </Text>
                        )}
                        <Text className="text-[15px] font-bold text-txt-primary leading-5 tracking-tight" numberOfLines={2}>
                            {marketTitle}
                        </Text>
                    </View>
                </View>

                {/* Price Row (Simplified) */}
                <View className="flex-row justify-between items-center mb-1">
                    <View className="flex-row items-center gap-2.5">
                        <AnimatedPrice
                            value={displayPrice}
                            format="cents"
                            style={{ fontSize: 26, fontWeight: '800', color: Theme.textPrimary }}
                        />
                    </View>
                    {volume !== '—' && (
                        <Text className="text-xs font-medium text-txt-secondary">Vol: {volume}</Text>
                    )}
                </View>
            </View>
        </TouchableOpacity>
    );
};

export const MarketRail = () => {
    const { backendUser } = useUser();
    const [railItems, setRailItems] = useState<RailItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [portfolioValue, setPortfolioValue] = useState<number | null>(null);

    const loadPortfolioValue = useCallback(async () => {
        if (!backendUser) return;
        try {
            const { positions } = await api.getPositions(backendUser.id);
            // Calculate total portfolio value: sum of all position current values
            const totalPositionValue = positions.active.reduce((sum, pos) => {
                return sum + (pos.currentValue || 0);
            }, 0);
            setPortfolioValue(totalPositionValue);
        } catch (error) {
            console.error('Failed to load portfolio value:', error);
        }
    }, [backendUser]);

    useEffect(() => {
        loadRailData();
        if (backendUser) {
            loadPortfolioValue();
        }
    }, [backendUser, loadPortfolioValue]);

    const loadRailData = async () => {
        try {
            setLoading(true);
            const { events } = await marketsApi.fetchEvents(100, { status: 'active', withNestedMarkets: true });
            const scoredItems = getScoredEventsForRail(events, 7);
            setRailItems(scoredItems);
        } catch (error) {
            console.error('Failed to load market rail:', error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return <MarketRailSkeleton />;
    }

    if (railItems.length === 0) return null;

    const formatPortfolioValue = (value: number | null) => {
        if (value === null) return '—';
        if (value >= 1000000) {
            return `$${(value / 1000000).toFixed(2)}M`;
        }
        if (value >= 1000) {
            return `$${(value / 1000).toFixed(1)}K`;
        }
        return `$${value.toFixed(2)}`;
    };

    return (
        <View className="py-5 ">
            <FlatList
                horizontal
                data={railItems}
                keyExtractor={(item) => item.event.ticker}
                renderItem={({ item }) => (
                    <RailCard
                        item={item}
                    />
                )}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 12 }}
                snapToInterval={CARD_WIDTH + CARD_MARGIN * 2}
                decelerationRate="fast"
                snapToAlignment="start"
            />
        </View>
    );
};

// Minimal styles for card dimensions and chart
const styles = StyleSheet.create({
    railCard: {
        width: CARD_WIDTH,
        backgroundColor: Theme.bgCard,
        borderRadius: 20,
        marginHorizontal: CARD_MARGIN,
        overflow: 'hidden',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 12,
        elevation: 5,
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.05)',
    },
    chartContainer: {
        marginBottom: 8,
        borderRadius: 12,
        overflow: 'hidden',
        minHeight: CHART_HEIGHT,
    },
});
