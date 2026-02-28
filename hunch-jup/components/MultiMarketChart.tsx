import { Theme } from '@/constants/theme';
import { marketsApi } from '@/lib/api';
import { CandleData, Market } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Easing,
    GestureResponderEvent,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

const SCREEN_WIDTH = Dimensions.get('window').width;
const CHART_HEIGHT = 260;
const CHART_PADDING = 16;
const RIGHT_PADDING = 20;
const SCRUB_HAPTIC_THROTTLE_MS = 40;

type TimeFilter = '24h' | '1w' | '1m' | 'all';
const TIME_FILTER_OPTIONS: { key: TimeFilter; label: string; seconds: number }[] = [
    { key: '24h', label: '24H', seconds: 24 * 60 * 60 },
    { key: '1w', label: '1W', seconds: 7 * 24 * 60 * 60 },
    { key: '1m', label: '1M', seconds: 30 * 24 * 60 * 60 },
    { key: 'all', label: 'All', seconds: 365 * 24 * 60 * 60 },
];

const CHART_GREEN = '#10ff1f';
const CHART_PINK = Theme.chartNegative;

interface MarketChartData {
    market: Market;
    candles: CandleData[];
    color: string;
    loading: boolean;
}

interface MultiMarketChartProps {
    markets: Market[];
    title?: string;
    /** When true, show market selector chips; only selected markets are charted. For numeric-outcome markets. */
    selectionMode?: boolean;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
}

export const MultiMarketChart: React.FC<MultiMarketChartProps> = ({
    markets,
    title,
    selectionMode = false,
    onInteractionStart,
    onInteractionEnd,
}) => {
    const [marketData, setMarketData] = useState<MarketChartData[]>([]);
    const [loading, setLoading] = useState(true);
    const [touchPosition, setTouchPosition] = useState<{ x: number; index: number } | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);
    const [selectedTickers, setSelectedTickers] = useState<Set<string>>(() =>
        new Set(markets[0] ? [markets[0].ticker] : [])
    );

    const [timeFilter, setTimeFilter] = useState<TimeFilter>('1w');
    const scrubHapticRef = useRef({ lastIndex: -1, lastTime: 0 });
    const pulseAnim = useRef(new Animated.Value(0.55)).current;

    const marketTickersKey = markets.map((m) => m.ticker).join(',');
    useEffect(() => {
        if (selectionMode) {
            setSelectedTickers(new Set(markets[0] ? [markets[0].ticker] : []));
        }
    }, [selectionMode, marketTickersKey]);

    const chartWidth = SCREEN_WIDTH - CHART_PADDING * 2;
    const drawableWidth = chartWidth - RIGHT_PADDING;

    useEffect(() => {
        let cancelled = false;
        const loadMarketCandles = async () => {
            setLoading(true);
            try {
                const selectedFilter = TIME_FILTER_OPTIONS.find((opt) => opt.key === timeFilter);
                const endTs = Math.floor(Date.now() / 1000);
                const results = await Promise.all(
                    markets.slice(0, 4).map(async (market, index) => {
                        const startTs =
                            timeFilter === 'all'
                                ? Math.max(0, market.openTime || endTs - 365 * 24 * 60 * 60)
                                : Math.max(0, endTs - (selectedFilter?.seconds || 7 * 24 * 60 * 60));
                        const candles = await marketsApi.fetchCandlesticksByMint({
                            ticker: market.ticker,
                            seriesTicker: market.eventTicker,
                            startTs,
                            endTs,
                            periodInterval: 60,
                        }).catch(() => [] as CandleData[]);

                        return {
                            market,
                            candles,
                            color: index % 2 === 0 ? CHART_GREEN : CHART_PINK,
                            loading: false,
                        };
                    })
                );
                if (!cancelled) {
                    setMarketData(results);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                }
            }
        };
        loadMarketCandles();
        return () => {
            cancelled = true;
        };
    }, [markets, timeFilter]);

    // Skeleton pulse animation
    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 0.9,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 0.5,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulseAnim]);

    // Filter to selected markets when in selectionMode
    const dataForChart = useMemo(() => {
        if (!selectionMode) return marketData;
        return marketData.filter((d) => selectedTickers.has(d.market.ticker));
    }, [marketData, selectionMode, selectedTickers]);

    // Generate chart paths (from dataForChart: all or selected)
    const chartPaths = useMemo(() => {
        if (dataForChart.length === 0) return [];

        // Find global min/max across all candles for unified scale
        let globalMin = Infinity;
        let globalMax = -Infinity;
        let maxLength = 0;

        dataForChart.forEach(({ candles }) => {
            if (candles.length > 0) {
                const recentCandles = candles.slice(-20);
                maxLength = Math.max(maxLength, recentCandles.length);
                recentCandles.forEach(c => {
                    globalMin = Math.min(globalMin, c.close);
                    globalMax = Math.max(globalMax, c.close);
                });
            }
        });

        if (globalMin === Infinity) return [];

        const priceRange = globalMax - globalMin || 0.01;
        const paddingY = CHART_HEIGHT * 0.15;
        const chartHeight = CHART_HEIGHT - paddingY * 2;

        return dataForChart.map(({ candles, color, market }) => {
            if (candles.length === 0) return null;

            const recentCandles = candles.slice(-20);
            const prices = recentCandles.map(c => c.close);

            const points = prices.map((price, index) => {
                const x = (index / (maxLength - 1)) * drawableWidth;
                const y = paddingY + chartHeight - ((price - globalMin) / priceRange) * chartHeight;
                return { x, y, price };
            });

            // Angular / straight line segments (polygonal, sharp edges)
            let path = `M ${points[0].x} ${points[0].y}`;
            for (let i = 1; i < points.length; i++) {
                path += ` L ${points[i].x} ${points[i].y}`;
            }

            const first = points[0];
            const last = points[points.length - 1];
            const areaPath = `${path} L ${last.x} ${CHART_HEIGHT} L ${first.x} ${CHART_HEIGHT} Z`;

            return { path, areaPath, points, color, market };
        }).filter(Boolean);
    }, [dataForChart, chartWidth]);

    // Get prices at touch position (uses dataForChart so only selected in selectionMode)
    const getPricesAtIndex = useCallback((index: number) => {
        return dataForChart.map(({ market, candles, color }) => {
            const recentCandles = candles.slice(-20);
            const clampedIndex = Math.min(index, recentCandles.length - 1);
            const price = recentCandles[clampedIndex]?.close ?? 0;
            return { market, price, color };
        });
    }, [dataForChart]);

    // Touch handlers with haptics on scrub
    const handleTouch = useCallback((event: GestureResponderEvent) => {
        const { locationX } = event.nativeEvent;
        const clampedX = Math.max(0, Math.min(locationX, drawableWidth));
        const maxLength = Math.max(...dataForChart.map(d => d.candles.slice(-20).length), 1);
        const index = Math.round((clampedX / drawableWidth) * (maxLength - 1));
        const now = Date.now();
        const { lastIndex, lastTime } = scrubHapticRef.current;
        if (index !== lastIndex) {
            if (lastIndex >= 0 && now - lastTime >= SCRUB_HAPTIC_THROTTLE_MS) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            }
            scrubHapticRef.current = { lastIndex: index, lastTime: now };
        }
        setTouchPosition({ x: clampedX, index });
    }, [chartWidth, dataForChart]);

    const handleTouchStart = useCallback((event: GestureResponderEvent) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setIsInteracting(true);
        onInteractionStart?.();
        handleTouch(event);
    }, [handleTouch, onInteractionStart]);

    const handleTouchMove = useCallback((event: GestureResponderEvent) => {
        handleTouch(event);
    }, [handleTouch]);

    const handleTouchEnd = useCallback(() => {
        scrubHapticRef.current = { lastIndex: -1, lastTime: 0 };
        setTimeout(() => {
            setIsInteracting(false);
            setTouchPosition(null);
            onInteractionEnd?.();
        }, 300);
    }, [onInteractionEnd]);

    const headerRow = (
        <View style={styles.headerRow}>
            {title ? <Text style={styles.headerTitle}>{title}</Text> : null}
            <View style={styles.timeFilters}>
                {TIME_FILTER_OPTIONS.map((option) => {
                    const isSelected = timeFilter === option.key;
                    return (
                        <TouchableOpacity
                            key={option.key}
                            style={[styles.timeFilterPill, isSelected && styles.timeFilterPillSelected]}
                            onPress={() => {
                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                setTimeFilter(option.key);
                            }}
                            activeOpacity={0.6}
                        >
                            <Text
                                style={[
                                    styles.timeFilterText,
                                    { color: isSelected ? '#fff' : Theme.textDisabled },
                                ]}
                            >
                                {option.label}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );

    const tickerToColor = useMemo(() => {
        const m = new Map<string, string>();
        marketData.forEach((d) => m.set(d.market.ticker, d.color));
        return m;
    }, [marketData]);

    const fallbackColor = (i: number) => (i % 2 === 0 ? CHART_GREEN : CHART_PINK);

    const toggleMarket = useCallback((ticker: string) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setSelectedTickers((prev) => {
            const next = new Set(prev);
            if (next.has(ticker)) next.delete(ticker);
            else next.add(ticker);
            return next;
        });
    }, []);

    const selectionChips = selectionMode ? (
        <View style={styles.selectionChips}>
            {markets.map((m, i) => {
                const sel = selectedTickers.has(m.ticker);
                const color = tickerToColor.get(m.ticker) ?? fallbackColor(i);
                const lab = (m.yesSubTitle || m.title || '').length > 18
                    ? (m.yesSubTitle || m.title || '').substring(0, 18) + '…'
                    : (m.yesSubTitle || m.title || '');
                return (
                    <TouchableOpacity
                        key={m.ticker}
                        style={[
                            styles.selectionChip,
                            sel ? { backgroundColor: color + '22', borderColor: color } : { borderColor: Theme.border },
                        ]}
                        onPress={() => toggleMarket(m.ticker)}
                        activeOpacity={0.7}
                    >
                        <View style={[styles.selectionChipDot, { backgroundColor: sel ? color : Theme.border }]} />
                        <Text
                            style={[styles.selectionChipText, { color: sel ? Theme.textPrimary : Theme.textDisabled }]}
                            numberOfLines={1}
                        >
                            {lab || 'Market'}
                        </Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    ) : null;

    if (loading) {
        const pad = CHART_HEIGHT * 0.15;
        const ch = CHART_HEIGHT - 2 * pad;
        const w = chartWidth;
        const skeletonPaths = [
            `M 0 ${pad + ch * 0.35} L ${w * 0.25} ${pad + ch * 0.65} L ${w * 0.5} ${pad + ch * 0.2} L ${w * 0.75} ${pad + ch * 0.75} L ${w} ${pad + ch * 0.45}`,
            `M 0 ${pad + ch * 0.5} L ${w * 0.25} ${pad + ch * 0.3} L ${w * 0.5} ${pad + ch * 0.7} L ${w * 0.75} ${pad + ch * 0.4} L ${w} ${pad + ch * 0.55}`,
            `M 0 ${pad + ch * 0.7} L ${w * 0.25} ${pad + ch * 0.5} L ${w * 0.5} ${pad + ch * 0.85} L ${w * 0.75} ${pad + ch * 0.3} L ${w} ${pad + ch * 0.6}`,
        ];
        return (
            <View style={styles.container}>
                {headerRow}
                {selectionChips}
                <Animated.View style={{ opacity: pulseAnim }}>
                    <View style={styles.chartContainer}>
                        <Svg width={chartWidth} height={CHART_HEIGHT}>
                            {skeletonPaths.map((d, i) => (
                                <Path
                                    key={i}
                                    d={d}
                                    stroke={Theme.border}
                                    strokeWidth={2.5}
                                    fill="none"
                                    strokeLinecap="butt"
                                    strokeLinejoin="miter"
                                />
                            ))}
                        </Svg>
                    </View>
                    <View style={styles.legendRow}>
                        {[1, 2, 3].map((i) => (
                            <View key={i} style={styles.legendItem}>
                                <View style={[styles.legendDot, styles.skeletonDot]} />
                                <View style={[styles.skeletonBar, { width: 56 }]} />
                                <View style={[styles.skeletonBar, { width: 32 }]} />
                            </View>
                        ))}
                    </View>
                </Animated.View>
            </View>
        );
    }

    if (selectionMode && selectedTickers.size === 0) {
        return (
            <View style={styles.container}>
                {headerRow}
                {selectionChips}
                <View style={styles.emptyContainer}>
                    <Ionicons name="checkbox-outline" size={32} color={Theme.textDisabled} />
                    <Text style={styles.emptyText}>Select one or more markets to compare</Text>
                </View>
            </View>
        );
    }

    if (chartPaths.length === 0) {
        return (
            <View style={styles.container}>
                {headerRow}
                {selectionChips}
                <View style={styles.emptyContainer}>
                    <Ionicons name="analytics-outline" size={32} color={Theme.textDisabled} />
                    <Text style={styles.emptyText}>No chart data available</Text>
                </View>
            </View>
        );
    }

    const currentPrices = isInteracting && touchPosition
        ? getPricesAtIndex(touchPosition.index)
        : dataForChart.map(({ market, candles, color }) => ({
            market,
            price: candles.slice(-20).pop()?.close ?? 0,
            color,
        }));

    return (
        <View style={styles.container}>
            {headerRow}
            {selectionChips}
            {/* Chart */}
            <View
                style={styles.chartContainer}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onStartShouldSetResponderCapture={() => true}
                onMoveShouldSetResponderCapture={() => true}
                onResponderTerminationRequest={() => false}
                onResponderGrant={handleTouchStart}
                onResponderMove={handleTouchMove}
                onResponderRelease={handleTouchEnd}
                onResponderTerminate={handleTouchEnd}
            >
                <Svg width={chartWidth} height={CHART_HEIGHT}>
                    <Defs>
                        {chartPaths.map((item, idx) => (
                            <LinearGradient key={`grad-${idx}`} id={`gradient-${idx}`} x1="0" y1="0" x2="0" y2="1">
                                <Stop offset="0%" stopColor={item!.color} stopOpacity={0.12} />
                                <Stop offset="100%" stopColor={item!.color} stopOpacity={0} />
                            </LinearGradient>
                        ))}
                    </Defs>

                    {/* Area fill (like LightChart / trade drawer) */}
                    {chartPaths.map((item, idx) => (
                        <Path
                            key={`area-${idx}`}
                            d={item!.areaPath}
                            fill={`url(#gradient-${idx})`}
                        />
                    ))}

                    {/* Line paths - strokeWidth 3 like trade drawer */}
                    {chartPaths.map((item, idx) => (
                        <Path
                            key={`line-${idx}`}
                            d={item!.path}
                            stroke={item!.color}
                            strokeWidth={3}
                            fill="none"
                            strokeLinecap="butt"
                            strokeLinejoin="miter"
                        />
                    ))}

                    {/* Right-side dim overlay while scrubbing: gray/less opaque */}
                    {isInteracting && touchPosition && touchPosition.x < chartWidth && (
                        <Rect
                            x={touchPosition.x}
                            y={0}
                            width={chartWidth - touchPosition.x}
                            height={CHART_HEIGHT}
                            fill="rgba(255,255,255,0.72)"
                        />
                    )}

                    {/* Crosshair when interacting (LightChart style) */}
                    {isInteracting && touchPosition && (
                        <Line
                            x1={touchPosition.x}
                            y1={0}
                            x2={touchPosition.x}
                            y2={CHART_HEIGHT}
                            stroke="#9CA3AF"
                            strokeWidth={1}
                            strokeDasharray="4,4"
                            strokeOpacity={0.7}
                        />
                    )}

                    {/* Static dot at end (like LightChart - no pulse/glow) */}
                    {!isInteracting && chartPaths.map((item, idx) => {
                        const lastPoint = item!.points[item!.points.length - 1];
                        return (
                            <Circle
                                key={`dot-${idx}`}
                                cx={lastPoint.x}
                                cy={lastPoint.y}
                                r={4}
                                fill={item!.color}
                                stroke="#FFFFFF"
                                strokeWidth={1.5}
                            />
                        );
                    })}

                    {/* Touch indicators */}
                    {isInteracting && touchPosition && chartPaths.map((item, idx) => {
                        const index = Math.min(touchPosition.index, item!.points.length - 1);
                        const point = item!.points[index];
                        if (!point) return null;
                        return (
                            <Circle
                                key={`touch-${idx}`}
                                cx={point.x}
                                cy={point.y}
                                r={5}
                                fill={item!.color}
                                stroke="#FFF"
                                strokeWidth={2}
                            />
                        );
                    })}
                </Svg>
                {/* Odds tooltip following finger while scrubbing — all markets in the graph */}
                {isInteracting && touchPosition && currentPrices.length > 0 && (
                    <View
                        pointerEvents="none"
                        style={[
                            styles.scrubOddsPill,
                            {
                                left: Math.max(4, Math.min(touchPosition.x - 32, chartWidth - 72)),
                            },
                        ]}
                    >
                        {currentPrices.map(({ market, price, color }) => (
                            <View key={market.ticker} style={styles.scrubOddsRow}>
                                <View style={[styles.scrubOddsDot, { backgroundColor: color }]} />
                                <Text style={styles.scrubOddsText}>{(price * 100).toFixed(1)}%</Text>
                            </View>
                        ))}
                    </View>
                )}
            </View>

            {/* Market names below: 2 on left, 2 on right */}
            <View style={styles.legendTwoCols}>
                <View style={styles.legendColumnLeft}>
                    {currentPrices.slice(0, 2).map(({ market, color }) => {
                        const displayName = market.yesSubTitle || market.title;
                        const short = displayName.length > 14 ? displayName.substring(0, 14) + '…' : displayName;
                        return (
                            <View key={market.ticker} style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: color }]} />
                                <Text style={styles.legendTitle} numberOfLines={1}>{short}</Text>
                            </View>
                        );
                    })}
                </View>
                <View style={styles.legendColumnRight}>
                    {currentPrices.slice(2, 4).map(({ market, color }) => {
                        const displayName = market.yesSubTitle || market.title;
                        const short = displayName.length > 14 ? displayName.substring(0, 14) + '…' : displayName;
                        return (
                            <View key={market.ticker} style={styles.legendItem}>
                                <View style={[styles.legendDot, { backgroundColor: color }]} />
                                <Text style={styles.legendTitle} numberOfLines={1}>{short}</Text>
                            </View>
                        );
                    })}
                </View>
            </View>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        marginHorizontal: CHART_PADDING,
    },
    emptyContainer: {
        height: CHART_HEIGHT,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 8,
    },
    emptyText: {
        fontSize: 13,
        color: Theme.textDisabled,
    },
    legendRow: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-start',
        alignItems: 'center',
        gap: 12,
        marginTop: 14,
    },
    legendTwoCols: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginTop: 14,
        gap: 12,
        paddingLeft: 24,
        paddingRight: 40,
    },
    legendColumnLeft: {
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-start',
        flex: 1,
    },
    legendColumnRight: {
        flexDirection: 'column',
        gap: 6,
        alignItems: 'flex-end',
        flex: 1,
    },
    legendItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    legendDot: {
        width: 9,
        height: 9,
        borderRadius: 5,
    },
    skeletonDot: {
        backgroundColor: Theme.border,
    },
    skeletonBar: {
        height: 10,
        borderRadius: 4,
        backgroundColor: Theme.border,
    },
    legendTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: Theme.textPrimary,
        maxWidth: 140,
    },
    legendPrice: {
        fontSize: 15,
        fontWeight: '700',
        fontVariant: ['tabular-nums'],
    },
    headerRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 12,
    },
    selectionChips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
        marginBottom: 12,
    },
    selectionChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1.5,
    },
    selectionChipDot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
    selectionChipText: {
        fontSize: 13,
        fontWeight: '600',
        maxWidth: 140,
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: Theme.textPrimary,
    },
    chartContainer: {
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: '#F5F5F5',
    },
    scrubOddsPill: {
        
        position: 'absolute',
        top: 10,
        backgroundColor: 'rgba(0,0,0,0.42)',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        minWidth: 60,
        alignItems: 'flex-start',
        gap: 4,
    },
    scrubOddsRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    scrubOddsDot: {
        width: 6,
        height: 6,
        borderRadius: 3,
    },
    scrubOddsText: {
        color: '#fff',
        fontSize: 15,
        fontWeight: '700',
    },
    timeFilters: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
    },
    timeFilterPill: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    timeFilterPillSelected: {
        backgroundColor: '#000000',
    },
    timeFilterText: {
        fontSize: 12,
        fontWeight: '600',
        color: Theme.textDisabled,
    },
});

export default MultiMarketChart;
