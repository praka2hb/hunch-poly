import { Theme } from '@/constants/theme';
import { marketsApi } from '@/lib/api';
import { CandleData, Market } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
    ActivityIndicator,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { MiniChart } from './MiniChart';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CARD_WIDTH = SCREEN_WIDTH * 0.75;
const CHART_HEIGHT = 120;

interface EventChartCardProps {
    market: Market;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
}

// Helper for price change calculation
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

export const EventChartCard: React.FC<EventChartCardProps> = ({
    market,
    onInteractionStart,
    onInteractionEnd,
}) => {
    const [candles, setCandles] = useState<CandleData[]>([]);
    const [loading, setLoading] = useState(true);
    const [displayPrice, setDisplayPrice] = useState<number>(0);
    const [isInteracting, setIsInteracting] = useState(false);

    const priceChange = useMemo(() => getPriceChange(candles), [candles]);
    const baseIsPositive = priceChange?.isPositive ?? true;
    const basePrice = priceChange?.currentPrice ?? (market.yesBid ? parseFloat(market.yesBid) : 0);
    const firstPrice = candles.length > 0 ? Number(candles[0].close) : basePrice;

    // Calculate real-time percentage change during scrubbing
    const numDisplayPrice = Number(displayPrice);
    const scrubChangePercent = firstPrice > 0 ? ((numDisplayPrice - firstPrice) / firstPrice) * 100 : 0;
    const scrubIsPositive = scrubChangePercent >= 0;

    // Use scrub values when interacting, otherwise use base values
    const isPositive = isInteracting ? scrubIsPositive : baseIsPositive;
    const displayChangePercent = isInteracting ? scrubChangePercent.toFixed(1) : priceChange?.changePercent;

    // Get probability from bid/ask
    const yesBid = market.yesBid ? parseFloat(market.yesBid) * 100 : null;
    const yesAsk = market.yesAsk ? parseFloat(market.yesAsk) * 100 : null;
    const probability = yesBid && yesAsk ? ((yesBid + yesAsk) / 2) : null;

    // Reset display price when base price changes
    useEffect(() => {
        if (!isInteracting && typeof basePrice === 'number') {
            setDisplayPrice(basePrice);
        }
    }, [basePrice, isInteracting]);

    useEffect(() => {
        let cancelled = false;
        const loadCandles = async () => {
            setLoading(true);
            try {
                const endTs = Math.floor(Date.now() / 1000);
                const startTs = Math.max(0, endTs - 7 * 24 * 60 * 60);
                const data = await marketsApi.fetchCandlesticksByMint({
                    ticker: market.ticker,
                    seriesTicker: market.eventTicker,
                    startTs,
                    endTs,
                    periodInterval: 60,
                });
                if (!cancelled) {
                    setCandles(data);
                }
            } catch {
                if (!cancelled) {
                    setCandles([]);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        loadCandles();
        return () => {
            cancelled = true;
        };
    }, [market.ticker]);

    const handlePriceSelect = useCallback((price: number, _index: number) => {
        setDisplayPrice(price);
        setIsInteracting(true);
    }, []);

    const handleInteractionStart = useCallback(() => {
        setIsInteracting(true);
        onInteractionStart?.();
    }, [onInteractionStart]);

    const handleInteractionEnd = useCallback(() => {
        setIsInteracting(false);
        if (typeof basePrice === 'number') {
            setDisplayPrice(basePrice);
        }
        onInteractionEnd?.();
    }, [basePrice, onInteractionEnd]);

    const handleCardPress = () => {
        router.push({ pathname: '/market/[ticker]', params: { ticker: market.ticker } });
    };

    const formatCents = (price: number): string => {
        const cents = Math.round(price * 100);
        return `${cents}¢`;
    };

    return (
        <TouchableOpacity
            style={styles.card}
            activeOpacity={0.9}
            onPress={handleCardPress}
        >
            {/* Header */}
            <View style={styles.header}>
                <Text style={styles.title} numberOfLines={2}>
                    {market.title}
                </Text>
                {probability && (
                    <View style={styles.probabilityBadge}>
                        <Text style={styles.probabilityText}>
                            {probability.toFixed(0)}%
                        </Text>
                    </View>
                )}
            </View>

            {/* Price Row */}
            <View style={styles.priceRow}>
                <Text style={[styles.price, { color: isPositive ? '#32de12' : Theme.chartNegative }]}>
                    {formatCents(displayPrice)}
                </Text>
                {(priceChange || isInteracting) && (
                    <View style={[styles.changeChip, { backgroundColor: isPositive ? 'rgba(16, 255, 31, 0.15)' : 'rgba(255, 16, 240, 0.15)' }]}>
                        <Ionicons
                            name={isPositive ? 'caret-up' : 'caret-down'}
                            size={10}
                            color={isPositive ? '#32de12' : Theme.chartNegative}
                        />
                        <Text style={[styles.changeText, { color: isPositive ? '#32de12' : Theme.chartNegative }]}>
                            {isPositive ? '+' : ''}{displayChangePercent}%
                        </Text>
                    </View>
                )}
            </View>

            {/* Chart */}
            <View style={styles.chartContainer}>
                {loading ? (
                    <View style={styles.chartPlaceholder}>
                        <ActivityIndicator size="small" color={Theme.textDisabled} />
                    </View>
                ) : candles.length > 0 ? (
                    <MiniChart
                        candles={candles}
                        width={CARD_WIDTH - 32}
                        height={CHART_HEIGHT}
                        showLiveDot={!isInteracting}
                        onInteractionStart={handleInteractionStart}
                        onPriceSelect={handlePriceSelect}
                        onInteractionEnd={handleInteractionEnd}
                    />
                ) : (
                    <View style={styles.chartPlaceholder}>
                        <Ionicons name="analytics-outline" size={24} color={Theme.textDisabled} />
                        <Text style={styles.noDataText}>No chart data</Text>
                    </View>
                )}
            </View>

            {/* Live Indicator */}
            <View style={styles.liveIndicator}>
                <View style={[styles.liveDot, isInteracting && { backgroundColor: Theme.chartNegative }]} />
                <Text style={styles.liveText}>{isInteracting ? 'SCRUBBING' : 'LIVE'}</Text>
            </View>
        </TouchableOpacity>
    );
};

const styles = StyleSheet.create({
    card: {
        width: CARD_WIDTH,
        backgroundColor: Theme.bgCard,
        borderRadius: 16,
        padding: 16,
        marginRight: 12,
        borderWidth: 1,
        borderColor: Theme.border,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 12,
        gap: 12,
    },
    title: {
        flex: 1,
        fontSize: 14,
        fontWeight: '600',
        color: Theme.textPrimary,
        lineHeight: 20,
    },
    probabilityBadge: {
        backgroundColor: Theme.bgElevated,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
    },
    probabilityText: {
        fontSize: 12,
        fontWeight: '700',
        color: Theme.accentSubtle,
    },
    priceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginBottom: 12,
    },
    price: {
        fontSize: 24,
        fontWeight: '800',
        fontVariant: ['tabular-nums'],
    },
    changeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 6,
        gap: 2,
    },
    changeText: {
        fontSize: 11,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    chartContainer: {
        borderRadius: 10,
        overflow: 'hidden',
        minHeight: CHART_HEIGHT,
    },
    chartPlaceholder: {
        height: CHART_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: Theme.bgElevated,
        borderRadius: 10,
        gap: 8,
    },
    noDataText: {
        fontSize: 11,
        color: Theme.textDisabled,
    },
    liveIndicator: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        marginTop: 10,
    },
    liveDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: Theme.chartPositive,
    },
    liveText: {
        fontSize: 10,
        fontWeight: '700',
        color: Theme.textSecondary,
        letterSpacing: 1,
    },
});

export default EventChartCard;
