import { Theme, NEON_GREEN, NEON_PINK } from '@/constants/theme';
import { cryptoMarketsApi } from '@/lib/api';
import cryptoPriceSocket, { PricePoint } from '@/lib/cryptoPriceSocket';
import { CryptoMarketData } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Path, Circle, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_WIDTH = SCREEN_WIDTH - 40;
const CHART_HEIGHT = 220;
const CHART_PADDING_Y = 20;

// ─── Smooth chart helpers ─────────────────────────────────────────────────────
const MAX_CHART_POINTS = 150; // Keep ≤150 points for silky rendering
const CURVE_TENSION = 0.35;  // Catmull-Rom tension (0.3-0.4 is natural for price data)

/**
 * Downsample an array of {x,y} points using the Largest-Triangle-Three-Buckets
 * (LTTB) algorithm.  Preserves the perceptual shape of the curve while
 * drastically cutting the number of SVG path commands.
 */
function downsampleLTTB(
    data: { x: number; y: number }[],
    threshold: number,
): { x: number; y: number }[] {
    if (data.length <= threshold) return data;

    const sampled: { x: number; y: number }[] = [data[0]];
    const bucketSize = (data.length - 2) / (threshold - 2);

    for (let i = 1; i < threshold - 1; i++) {
        const rangeStart = Math.floor((i - 1) * bucketSize) + 1;
        const rangeEnd = Math.min(Math.floor(i * bucketSize) + 1, data.length);

        // Average of *next* bucket (triangle third vertex)
        const nextStart = Math.floor(i * bucketSize) + 1;
        const nextEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1, data.length);
        let avgX = 0, avgY = 0;
        for (let j = nextStart; j < nextEnd; j++) { avgX += data[j].x; avgY += data[j].y; }
        const cnt = nextEnd - nextStart;
        if (cnt > 0) { avgX /= cnt; avgY /= cnt; }

        // Pick the point in the current bucket that maximises triangle area
        const prev = sampled[sampled.length - 1];
        let maxArea = -1, bestIdx = rangeStart;
        for (let j = rangeStart; j < rangeEnd; j++) {
            const area = Math.abs(
                (prev.x - avgX) * (data[j].y - prev.y) -
                (prev.x - data[j].x) * (avgY - prev.y),
            );
            if (area > maxArea) { maxArea = area; bestIdx = j; }
        }
        sampled.push(data[bestIdx]);
    }

    sampled.push(data[data.length - 1]);
    return sampled;
}

/**
 * Build a smooth SVG `d` string from points using Catmull-Rom → cubic Bézier
 * conversion.  The resulting curve passes exactly through every input point
 * while maintaining C1 (tangent) continuity between segments.
 */
function smoothPath(pts: { x: number; y: number }[], tension: number): string {
    if (pts.length < 2) return '';
    if (pts.length === 2) {
        return `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
    }

    let d = `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];

        const cp1x = p1.x + (p2.x - p0.x) * tension / 3;
        const cp1y = p1.y + (p2.y - p0.y) * tension / 3;
        const cp2x = p2.x - (p3.x - p1.x) * tension / 3;
        const cp2y = p2.y - (p3.y - p1.y) * tension / 3;

        d += ` C${cp1x.toFixed(1)},${cp1y.toFixed(1)} ${cp2x.toFixed(1)},${cp2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
    }
    return d;
}

type Asset = 'btc' | 'eth' | 'sol';
type Interval = '5m' | '15m';

const ASSETS: { key: Asset; label: string; icon: string }[] = [
    { key: 'btc', label: 'BTC', icon: '₿' },
    { key: 'eth', label: 'ETH', icon: 'Ξ' },
    { key: 'sol', label: 'SOL', icon: '◎' },
];

const INTERVALS: { key: Interval; label: string }[] = [
    { key: '5m', label: '5M' },
    { key: '15m', label: '15M' },
];

const ASSET_NAMES: Record<Asset, string> = {
    btc: 'Bitcoin',
    eth: 'Ethereum',
    sol: 'Solana',
};

export default function CryptoMarketsScreen() {
    const router = useRouter();

    // Selection state
    const [selectedAsset, setSelectedAsset] = useState<Asset>('btc');
    const [selectedInterval, setSelectedInterval] = useState<Interval>('5m');

    // Market state
    const [activeMarket, setActiveMarket] = useState<CryptoMarketData | null>(null);
    const [nextMarket, setNextMarket] = useState<CryptoMarketData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Price state
    const [openingPrice, setOpeningPrice] = useState<number | null>(null);
    const [latestPrice, setLatestPrice] = useState<number | null>(null);
    const [priceHistory, setPriceHistory] = useState<PricePoint[]>([]);

    // Probability state
    const [upPct, setUpPct] = useState(50);
    const [downPct, setDownPct] = useState(50);

    // Countdown
    const [countdown, setCountdown] = useState(0);

    // Transition state
    const [isTransitioning, setIsTransitioning] = useState(false);
    const [showResult, setShowResult] = useState<string | null>(null);

    // Refs for intervals
    const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const probabilityRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const openingPriceRef = useRef<number | null>(null);
    const activeMarketRef = useRef<CryptoMarketData | null>(null);
    const nextMarketRef = useRef<CryptoMarketData | null>(null);
    const unsubWsRef = useRef<(() => void) | null>(null);

    // Keep refs in sync
    useEffect(() => { openingPriceRef.current = openingPrice; }, [openingPrice]);
    useEffect(() => { activeMarketRef.current = activeMarket; }, [activeMarket]);
    useEffect(() => { nextMarketRef.current = nextMarket; }, [nextMarket]);

    // ─── Pulsing animation for "Resolving soon" ───────────────────────────
    const pulseAnim = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (countdown <= 30 && countdown > 0) {
            const animation = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.3, duration: 500, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
                ])
            );
            animation.start();
            return () => animation.stop();
        }
    }, [countdown <= 30 && countdown > 0]);

    // ─── Load Market ──────────────────────────────────────────────────────
    const loadMarket = useCallback(async (asset: Asset, interval: Interval) => {
        setLoading(true);
        setError(null);
        setShowResult(null);
        setOpeningPrice(null);
        setPriceHistory([]);
        setNextMarket(null);

        try {
            const data = await cryptoMarketsApi.fetchCurrentMarket(asset, interval);
            setActiveMarket(data);

            // Set opening price from lastTradePrice if we're mid-market
            if (data.lastTradePrice) {
                const ltp = typeof data.lastTradePrice === 'string'
                    ? parseFloat(data.lastTradePrice) : data.lastTradePrice;
                // lastTradePrice in crypto markets is the option price (0-1), not the asset price
                // We'll wait for the WebSocket to provide the actual asset price
            }

            // Set initial probabilities
            if (data.upProbability !== null && data.downProbability !== null) {
                setUpPct(Math.round(data.upProbability * 1000) / 10);
                setDownPct(Math.round(data.downProbability * 1000) / 10);
            }

            // Fetch fresh probability
            if (data.conditionId && data.upTokenId) {
                try {
                    const prob = await cryptoMarketsApi.fetchProbability(data.conditionId, data.upTokenId);
                    setUpPct(prob.upPct);
                    setDownPct(prob.downPct);
                } catch {
                    // Use initial probabilities
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load market');
        } finally {
            setLoading(false);
        }
    }, []);

    // ─── Initial load + asset/interval change ─────────────────────────────
    useEffect(() => {
        loadMarket(selectedAsset, selectedInterval);
    }, [selectedAsset, selectedInterval, loadMarket]);

    // ─── WebSocket subscription ───────────────────────────────────────────
    useEffect(() => {
        if (!activeMarket) return;

        // Unsubscribe previous
        if (unsubWsRef.current) {
            unsubWsRef.current();
            unsubWsRef.current = null;
        }

        let hasSetOpening = openingPriceRef.current !== null;

        const unsub = cryptoPriceSocket.subscribe(selectedAsset, (price, history) => {
            setLatestPrice(price);
            setPriceHistory(history);

            // Set opening price from first WS price if not set
            if (!hasSetOpening) {
                setOpeningPrice(price);
                hasSetOpening = true;
            }
        });

        unsubWsRef.current = unsub;

        return () => {
            if (unsubWsRef.current) {
                unsubWsRef.current();
                unsubWsRef.current = null;
            }
        };
    }, [activeMarket, selectedAsset]);

    // ─── Countdown timer ──────────────────────────────────────────────────
    useEffect(() => {
        if (!activeMarket?.closeTime) return;

        const tick = () => {
            const remaining = Math.max(0, Math.floor((activeMarket.closeTime! - Date.now()) / 1000));
            setCountdown(remaining);
        };

        tick();
        countdownRef.current = setInterval(tick, 1000);

        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
        };
    }, [activeMarket?.closeTime]);

    // ─── Pre-fetch next market at T-60 ──────────────────────────────────
    useEffect(() => {
        if (countdown === 60 && activeMarket?.currentSlug && !nextMarketRef.current) {
            cryptoMarketsApi.fetchNextMarket(activeMarket.currentSlug, selectedInterval)
                .then((data) => {
                    if (data.available) {
                        setNextMarket(data);
                    }
                })
                .catch(() => { /* silently fail */ });
        }
    }, [countdown]);

    // ─── Market transition at T-0 ─────────────────────────────────────────
    useEffect(() => {
        if (countdown !== 0 || !activeMarketRef.current || isTransitioning) return;

        setIsTransitioning(true);

        // Determine result
        const op = openingPriceRef.current;
        const lp = latestPrice;
        const result = (op !== null && lp !== null && lp >= op) ? '↑ Up' : '↓ Down';
        setShowResult(result);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

        // After 2.5s, transition to next market
        setTimeout(() => {
            setShowResult(null);
            setPriceHistory([]);
            setOpeningPrice(null);
            setLatestPrice(null);

            if (nextMarketRef.current) {
                setActiveMarket(nextMarketRef.current);
                setNextMarket(null);
            } else {
                // Reload current market
                loadMarket(selectedAsset, selectedInterval);
            }
            setIsTransitioning(false);
        }, 2500);
    }, [countdown]);

    // ─── Probability polling ──────────────────────────────────────────────
    useEffect(() => {
        if (!activeMarket?.conditionId || !activeMarket?.upTokenId) return;

        const poll = async () => {
            try {
                const prob = await cryptoMarketsApi.fetchProbability(
                    activeMarket.conditionId,
                    activeMarket.upTokenId!
                );
                setUpPct(prob.upPct);
                setDownPct(prob.downPct);
            } catch {
                // Silently fail
            }
        };

        probabilityRef.current = setInterval(poll, 10_000);

        return () => {
            if (probabilityRef.current) clearInterval(probabilityRef.current);
        };
    }, [activeMarket?.conditionId, activeMarket?.upTokenId]);

    // ─── Cleanup on unmount ───────────────────────────────────────────────
    useEffect(() => {
        return () => {
            if (countdownRef.current) clearInterval(countdownRef.current);
            if (probabilityRef.current) clearInterval(probabilityRef.current);
            if (unsubWsRef.current) unsubWsRef.current();
        };
    }, []);

    // ─── Format countdown ─────────────────────────────────────────────────
    const formatCountdown = (secs: number) => {
        const m = Math.floor(secs / 60);
        const s = secs % 60;
        return `${m}m ${s.toString().padStart(2, '0')}s`;
    };

    // ─── Chart rendering ─────────────────────────────────────────────────
    const chartData = useMemo(() => {
        if (priceHistory.length < 2) return null;

        const prices = priceHistory.map(p => p.price);
        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const range = maxPrice - minPrice || 1;
        const padding = range * 0.003; // 0.3% padding
        const adjustedMin = minPrice - padding;
        const adjustedMax = maxPrice + padding;
        const adjustedRange = adjustedMax - adjustedMin || 1;

        const allPoints = priceHistory.map((p, i) => ({
            x: (i / (priceHistory.length - 1)) * CHART_WIDTH,
            y: CHART_PADDING_Y + (1 - (p.price - adjustedMin) / adjustedRange) * (CHART_HEIGHT - 2 * CHART_PADDING_Y),
        }));

        // Downsample with LTTB to keep rendering fast without losing visual fidelity
        const points = downsampleLTTB(allPoints, MAX_CHART_POINTS);

        // Smooth Catmull-Rom spline through all points (cubic Bézier output)
        const pathData = smoothPath(points, CURVE_TENSION);

        // Opening price Y position
        let openingY: number | null = null;
        if (openingPrice !== null) {
            openingY = CHART_PADDING_Y + (1 - (openingPrice - adjustedMin) / adjustedRange) * (CHART_HEIGHT - 2 * CHART_PADDING_Y);
        }

        const lastPoint = points[points.length - 1];
        const isUp = openingPrice !== null && latestPrice !== null && latestPrice >= openingPrice;

        return { pathData, openingY, lastPoint, isUp, points };
    }, [priceHistory, openingPrice, latestPrice]);

    const lineColor = chartData?.isUp !== false ? NEON_GREEN : NEON_PINK;

    // ─── Render ───────────────────────────────────────────────────────────
    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea} edges={['top']}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
                        <Ionicons name="chevron-back" size={24} color={Theme.textPrimary} />
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>Live Markets</Text>
                    <View style={{ width: 40 }} />
                </View>

                {/* Asset Pills */}
                <View style={styles.pillRow}>
                    {ASSETS.map((a) => (
                        <TouchableOpacity
                            key={a.key}
                            style={[styles.pill, selectedAsset === a.key && styles.pillSelected]}
                            onPress={() => {
                                if (a.key !== selectedAsset) {
                                    Haptics.selectionAsync();
                                    setSelectedAsset(a.key);
                                }
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.pillText,
                                selectedAsset === a.key && styles.pillTextSelected,
                            ]}>
                                {a.icon} {a.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Interval Pills */}
                <View style={styles.pillRow}>
                    {INTERVALS.map((iv) => (
                        <TouchableOpacity
                            key={iv.key}
                            style={[styles.intervalPill, selectedInterval === iv.key && styles.intervalPillSelected]}
                            onPress={() => {
                                if (iv.key !== selectedInterval) {
                                    Haptics.selectionAsync();
                                    setSelectedInterval(iv.key);
                                }
                            }}
                            activeOpacity={0.7}
                        >
                            <Text style={[
                                styles.intervalPillText,
                                selectedInterval === iv.key && styles.intervalPillTextSelected,
                            ]}>
                                {iv.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {loading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color={Theme.textPrimary} />
                        <Text style={styles.loadingText}>Loading market...</Text>
                    </View>
                ) : error ? (
                    <View style={styles.loadingContainer}>
                        <Ionicons name="warning-outline" size={48} color={Theme.textDisabled} />
                        <Text style={styles.errorText}>{error}</Text>
                        <TouchableOpacity
                            style={styles.retryButton}
                            onPress={() => loadMarket(selectedAsset, selectedInterval)}
                        >
                            <Text style={styles.retryButtonText}>Retry</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.content}>
                        {/* Countdown bar */}
                        <View style={styles.countdownBar}>
                            <Text style={styles.countdownTitle}>
                                {ASSET_NAMES[selectedAsset]} Up or Down
                            </Text>
                            <View style={styles.countdownBadge}>
                                {countdown <= 30 && countdown > 0 ? (
                                    <Animated.View style={[
                                        styles.resolvingBadge,
                                        { transform: [{ scale: pulseAnim }] }
                                    ]}>
                                        <Text style={styles.resolvingText}>Resolving soon</Text>
                                    </Animated.View>
                                ) : (
                                    <Text style={styles.countdownText}>
                                        Closes in {formatCountdown(countdown)}
                                    </Text>
                                )}
                            </View>
                        </View>

                        {/* Live Price Display */}
                        <View style={styles.priceDisplay}>
                            <Text style={[styles.currentPrice, { color: lineColor }]}>
                                {latestPrice !== null ? `$${latestPrice.toLocaleString('en-US', {
                                    minimumFractionDigits: 2,
                                    maximumFractionDigits: 2,
                                })}` : '—'}
                            </Text>
                            {openingPrice !== null && latestPrice !== null && (
                                <Text style={[
                                    styles.priceChange,
                                    { color: latestPrice >= openingPrice ? NEON_GREEN : NEON_PINK }
                                ]}>
                                    {latestPrice >= openingPrice ? '▲' : '▼'}{' '}
                                    {Math.abs(((latestPrice - openingPrice) / openingPrice) * 100).toFixed(3)}%
                                </Text>
                            )}
                        </View>

                        {/* Chart */}
                        <View style={styles.chartContainer}>
                            {showResult ? (
                                <View style={styles.resultOverlay}>
                                    <Text style={[
                                        styles.resultText,
                                        { color: showResult.includes('Up') ? NEON_GREEN : NEON_PINK }
                                    ]}>
                                        {showResult}
                                    </Text>
                                    <Text style={styles.resultSubtext}>Market resolved</Text>
                                </View>
                            ) : chartData ? (
                                <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
                                    <Defs>
                                        <SvgLinearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                                            <Stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
                                            <Stop offset="1" stopColor={lineColor} stopOpacity="0" />
                                        </SvgLinearGradient>
                                    </Defs>

                                    {/* Fill area under the line */}
                                    {chartData.points.length > 0 && (
                                        <Path
                                            d={`${chartData.pathData} L ${chartData.points[chartData.points.length - 1].x} ${CHART_HEIGHT} L ${chartData.points[0].x} ${CHART_HEIGHT} Z`}
                                            fill="url(#lineGrad)"
                                        />
                                    )}

                                    {/* Opening price dashed line */}
                                    {chartData.openingY !== null && (
                                        <Line
                                            x1={0}
                                            y1={chartData.openingY}
                                            x2={CHART_WIDTH}
                                            y2={chartData.openingY}
                                            stroke={Theme.textDisabled}
                                            strokeWidth={1}
                                            strokeDasharray="6,4"
                                            opacity={0.6}
                                        />
                                    )}

                                    {/* Price line */}
                                    <Path
                                        d={chartData.pathData}
                                        stroke={lineColor}
                                        strokeWidth={2.5}
                                        fill="none"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    />

                                    {/* Current price dot */}
                                    {chartData.lastPoint && (
                                        <>
                                            <Circle
                                                cx={chartData.lastPoint.x}
                                                cy={chartData.lastPoint.y}
                                                r={6}
                                                fill={lineColor}
                                                opacity={0.3}
                                            />
                                            <Circle
                                                cx={chartData.lastPoint.x}
                                                cy={chartData.lastPoint.y}
                                                r={3.5}
                                                fill={lineColor}
                                            />
                                        </>
                                    )}
                                </Svg>
                            ) : (
                                <View style={styles.chartPlaceholder}>
                                    <ActivityIndicator size="small" color={Theme.textDisabled} />
                                    <Text style={styles.chartPlaceholderText}>Waiting for price data...</Text>
                                </View>
                            )}

                            {/* Opening price label */}
                            {openingPrice !== null && chartData?.openingY !== null && (
                                <View style={[
                                    styles.openingPriceLabel,
                                    { top: (chartData?.openingY ?? 0) - 10 }
                                ]}>
                                    <Text style={styles.openingPriceLabelText}>
                                        Open ${openingPrice.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </Text>
                                </View>
                            )}
                        </View>

                        {/* Probability Bar */}
                        <View style={styles.probabilityContainer}>
                            <View style={styles.probabilityLabels}>
                                <Text style={[styles.probabilityLabel, { color: NEON_GREEN }]}>
                                    ↑ Up  {upPct.toFixed(1)}%
                                </Text>
                                <Text style={[styles.probabilityLabel, { color: NEON_PINK }]}>
                                    {downPct.toFixed(1)}%  Down ↓
                                </Text>
                            </View>
                            <View style={styles.probabilityBar}>
                                <View style={[
                                    styles.probabilityFillUp,
                                    { flex: upPct }
                                ]} />
                                <View style={[
                                    styles.probabilityFillDown,
                                    { flex: downPct }
                                ]} />
                            </View>
                        </View>

                        {/* Trade Buttons */}
                        <View style={styles.tradeButtons}>
                            <TouchableOpacity
                                style={[styles.tradeButton, styles.tradeButtonUp]}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    if (activeMarket) {
                                        router.push({
                                            pathname: '/market/[ticker]',
                                            params: {
                                                ticker: activeMarket.conditionId,
                                                side: 'yes',
                                                outcomeLabel: 'Up',
                                                feeNote: 'Variable fee applies ⓘ',
                                            },
                                        });
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.tradeButtonIcon}>↑</Text>
                                <Text style={styles.tradeButtonLabel}>Up</Text>
                                <Text style={styles.tradeButtonPct}>{upPct.toFixed(1)}%</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={[styles.tradeButton, styles.tradeButtonDown]}
                                onPress={() => {
                                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                                    if (activeMarket) {
                                        router.push({
                                            pathname: '/market/[ticker]',
                                            params: {
                                                ticker: activeMarket.conditionId,
                                                side: 'no',
                                                outcomeLabel: 'Down',
                                                feeNote: 'Variable fee applies ⓘ',
                                            },
                                        });
                                    }
                                }}
                                activeOpacity={0.8}
                            >
                                <Text style={styles.tradeButtonIcon}>↓</Text>
                                <Text style={styles.tradeButtonLabel}>Down</Text>
                                <Text style={styles.tradeButtonPct}>{downPct.toFixed(1)}%</Text>
                            </TouchableOpacity>
                        </View>

                        {/* Fee info */}
                        <View style={styles.feeInfo}>
                            <Ionicons name="information-circle-outline" size={14} color={Theme.textDisabled} />
                            <Text style={styles.feeInfoText}>
                                Fees vary based on market odds. Lower near 50/50, higher at extremes.
                            </Text>
                        </View>
                    </View>
                )}
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.bgMain,
    },
    safeArea: {
        flex: 1,
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        justifyContent: 'center',
        alignItems: 'center',
    },
    headerTitle: {
        fontSize: 18,
        fontWeight: '700',
        color: Theme.textPrimary,
    },
    pillRow: {
        flexDirection: 'row',
        paddingHorizontal: 20,
        gap: 8,
        marginBottom: 8,
    },
    pill: {
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
        backgroundColor: Theme.bgElevated,
    },
    pillSelected: {
        backgroundColor: Theme.textPrimary,
    },
    pillText: {
        fontSize: 15,
        fontWeight: '600',
        color: Theme.textSecondary,
    },
    pillTextSelected: {
        color: Theme.textInverse,
    },
    intervalPill: {
        paddingHorizontal: 16,
        paddingVertical: 6,
        borderRadius: 16,
        backgroundColor: Theme.bgElevated,
    },
    intervalPillSelected: {
        backgroundColor: Theme.textPrimary,
    },
    intervalPillText: {
        fontSize: 13,
        fontWeight: '600',
        color: Theme.textSecondary,
    },
    intervalPillTextSelected: {
        color: Theme.textInverse,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
    },
    loadingText: {
        fontSize: 15,
        color: Theme.textSecondary,
    },
    errorText: {
        fontSize: 15,
        color: Theme.textSecondary,
        textAlign: 'center',
        paddingHorizontal: 40,
        marginTop: 8,
    },
    retryButton: {
        marginTop: 12,
        paddingHorizontal: 24,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: Theme.textPrimary,
    },
    retryButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: Theme.textInverse,
    },
    content: {
        flex: 1,
        paddingHorizontal: 20,
    },
    countdownBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 8,
        marginTop: 8,
    },
    countdownTitle: {
        fontSize: 16,
        fontWeight: '700',
        color: Theme.textPrimary,
    },
    countdownBadge: {},
    countdownText: {
        fontSize: 14,
        fontWeight: '500',
        color: Theme.textSecondary,
    },
    resolvingBadge: {
        backgroundColor: NEON_PINK + '20',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 12,
    },
    resolvingText: {
        fontSize: 12,
        fontWeight: '700',
        color: NEON_PINK,
    },
    priceDisplay: {
        flexDirection: 'row',
        alignItems: 'baseline',
        gap: 10,
        marginBottom: 8,
    },
    currentPrice: {
        fontSize: 32,
        fontWeight: '800',
        letterSpacing: -1,
    },
    priceChange: {
        fontSize: 15,
        fontWeight: '600',
    },
    chartContainer: {
        height: CHART_HEIGHT,
        marginBottom: 16,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: Theme.bgCard,
        justifyContent: 'center',
        alignItems: 'center',
    },
    chartPlaceholder: {
        alignItems: 'center',
        gap: 8,
    },
    chartPlaceholderText: {
        fontSize: 13,
        color: Theme.textDisabled,
    },
    resultOverlay: {
        ...StyleSheet.absoluteFillObject,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
        borderRadius: 16,
    },
    resultText: {
        fontSize: 42,
        fontWeight: '900',
        letterSpacing: -1,
    },
    resultSubtext: {
        fontSize: 15,
        fontWeight: '500',
        color: Theme.textSecondary,
        marginTop: 4,
    },
    openingPriceLabel: {
        position: 'absolute',
        right: 8,
        backgroundColor: 'rgba(255,255,255,0.9)',
        paddingHorizontal: 6,
        paddingVertical: 2,
        borderRadius: 4,
    },
    openingPriceLabelText: {
        fontSize: 10,
        fontWeight: '600',
        color: Theme.textSecondary,
    },
    probabilityContainer: {
        marginBottom: 20,
    },
    probabilityLabels: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 6,
    },
    probabilityLabel: {
        fontSize: 14,
        fontWeight: '700',
    },
    probabilityBar: {
        flexDirection: 'row',
        height: 8,
        borderRadius: 4,
        overflow: 'hidden',
        backgroundColor: Theme.bgElevated,
    },
    probabilityFillUp: {
        backgroundColor: NEON_GREEN,
        borderTopLeftRadius: 4,
        borderBottomLeftRadius: 4,
    },
    probabilityFillDown: {
        backgroundColor: NEON_PINK,
        borderTopRightRadius: 4,
        borderBottomRightRadius: 4,
    },
    tradeButtons: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    tradeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 16,
        borderRadius: 16,
    },
    tradeButtonUp: {
        backgroundColor: NEON_GREEN + '18',
        borderWidth: 1.5,
        borderColor: NEON_GREEN + '40',
    },
    tradeButtonDown: {
        backgroundColor: NEON_PINK + '18',
        borderWidth: 1.5,
        borderColor: NEON_PINK + '40',
    },
    tradeButtonIcon: {
        fontSize: 18,
        fontWeight: '800',
        color: Theme.textPrimary,
    },
    tradeButtonLabel: {
        fontSize: 16,
        fontWeight: '700',
        color: Theme.textPrimary,
    },
    tradeButtonPct: {
        fontSize: 16,
        fontWeight: '600',
        color: Theme.textSecondary,
    },
    feeInfo: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        justifyContent: 'center',
    },
    feeInfoText: {
        fontSize: 11,
        color: Theme.textDisabled,
    },
});
