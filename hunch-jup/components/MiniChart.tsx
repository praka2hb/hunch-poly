import { Theme } from '@/constants/theme';
import { CandleData } from '@/lib/types';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    Animated,
    Easing,
    GestureResponderEvent,
    StyleSheet,
    View,
} from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';

// AnimatedCircle for the blinking dot
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface InteractiveChartProps {
    candles: CandleData[];
    width: number;
    height: number;
    onPriceSelect?: (price: number, index: number) => void;
    onInteractionStart?: () => void;
    onInteractionEnd?: () => void;
    showLiveDot?: boolean;
    interactive?: boolean;
}

/**
 * InteractiveChart - Touch-enabled chart with price tooltip
 * Shows price in cents format when user touches/drags on chart
 */
export const MiniChart: React.FC<InteractiveChartProps> = ({
    candles,
    width,
    height,
    onPriceSelect,
    onInteractionStart,
    onInteractionEnd,
    showLiveDot = true,
    interactive = true,
}) => {
    const [touchPosition, setTouchPosition] = useState<{ x: number; y: number; price: number } | null>(null);
    const [isInteracting, setIsInteracting] = useState(false);

    // Animation for blinking live dot
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const glowAnim = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        // Create pulsing animation for the live dot
        const pulseAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, {
                    toValue: 1.4,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
                Animated.timing(pulseAnim, {
                    toValue: 1,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
            ])
        );

        const glowAnimation = Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, {
                    toValue: 0.6,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
                Animated.timing(glowAnim, {
                    toValue: 0.3,
                    duration: 800,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: false,
                }),
            ])
        );

        pulseAnimation.start();
        glowAnimation.start();

        return () => {
            pulseAnimation.stop();
            glowAnimation.stop();
        };
    }, [pulseAnim, glowAnim]);

    // Process candle data
    const chartData = useMemo(() => {
        if (!candles || candles.length === 0) {
            return { prices: [], minPrice: 0, maxPrice: 1, path: '', areaPath: '' };
        }

        // Use all candles for accurate representation
        const prices = candles.map(c => c.close);

        if (prices.length === 0) {
            return { prices: [], minPrice: 0, maxPrice: 1, path: '', areaPath: '' };
        }

        const minPrice = Math.min(...prices);
        const maxPrice = Math.max(...prices);
        const priceRange = maxPrice - minPrice || 0.01;

        // Padding for chart
        const paddingY = height * 0.15;
        const chartHeight = height - paddingY * 2;
        const chartWidth = width;

        // Generate SVG path with points for each candle
        const points = prices.map((price, index) => {
            const x = prices.length === 1 ? chartWidth / 2 : (index / (prices.length - 1)) * chartWidth;
            const y = paddingY + chartHeight - ((price - minPrice) / priceRange) * chartHeight;
            return { x, y, price };
        });

        // Create straight line path (no bezier curves for accurate data)
        let path = '';
        let areaPath = '';

        if (points.length > 0) {
            path = `M ${points[0].x} ${points[0].y}`;
            areaPath = `M ${points[0].x} ${height}`;
            areaPath += ` L ${points[0].x} ${points[0].y}`;

            // Use straight lines (L command) instead of bezier curves (Q command)
            for (let i = 1; i < points.length; i++) {
                const curr = points[i];
                path += ` L ${curr.x} ${curr.y}`;
                areaPath += ` L ${curr.x} ${curr.y}`;
            }

            areaPath += ` L ${points[points.length - 1].x} ${height}`;
            areaPath += ' Z';
        }

        return { prices, minPrice, maxPrice, path, areaPath, points };
    }, [candles, width, height]);

    // Determine trend direction (up = green, down = pink) for selected timeframe
    const isPositive = useMemo(() => {
        if (!chartData.prices || chartData.prices.length < 2) return true;
        return chartData.prices[chartData.prices.length - 1] >= chartData.prices[0];
    }, [chartData.prices]);

    const lineColor = isPositive ? '#10ff1f' : Theme.chartNegative;
    const gradientId = `gradient-${isPositive ? 'positive' : 'negative'}`;

    // Handle touch events - smooth sliding
    const handleTouch = useCallback((event: GestureResponderEvent) => {
        if (!chartData.points || chartData.points.length === 0) return;

        const { locationX } = event.nativeEvent;

        // Clamp to chart bounds
        const clampedX = Math.max(0, Math.min(locationX, width));

        // Find closest point based on x position
        const index = Math.round((clampedX / width) * (chartData.points.length - 1));
        const clampedIndex = Math.max(0, Math.min(index, chartData.points.length - 1));
        const point = chartData.points[clampedIndex];

        if (point) {
            setTouchPosition({ x: point.x, y: point.y, price: point.price });
            onPriceSelect?.(point.price, clampedIndex);
        }
    }, [chartData.points, width, onPriceSelect]);

    const handleTouchStart = useCallback((event: GestureResponderEvent) => {
        setIsInteracting(true);
        onInteractionStart?.();
        handleTouch(event);
    }, [handleTouch, onInteractionStart]);

    const handleTouchMove = useCallback((event: GestureResponderEvent) => {
        // Immediately update on move for smooth sliding
        handleTouch(event);
    }, [handleTouch]);

    const handleTouchEnd = useCallback(() => {
        // Keep showing last position briefly then notify parent
        setTimeout(() => {
            setIsInteracting(false);
            setTouchPosition(null);
            onInteractionEnd?.();
        }, 300);
    }, [onInteractionEnd]);

    // Get the last point position for the live dot
    const lastPoint = chartData.points?.[chartData.points.length - 1];

    // Render placeholder if no data
    if (!candles || candles.length === 0 || !chartData.path) {
        return (
            <View style={[styles.container, { width, height }]}>
                <View style={styles.placeholder}>
                    <View style={styles.placeholderLine} />
                </View>
            </View>
        );
    }

    return (
        <View
            style={[styles.container, { width, height }]}
            {...(interactive ? {
                onStartShouldSetResponder: () => true,
                onMoveShouldSetResponder: () => true,
                onStartShouldSetResponderCapture: () => true,
                onMoveShouldSetResponderCapture: () => true,
                onResponderTerminationRequest: () => false,
                onResponderGrant: handleTouchStart,
                onResponderMove: handleTouchMove,
                onResponderRelease: handleTouchEnd,
                onResponderTerminate: handleTouchEnd,
            } : {})}
        >
            <Svg width={width} height={height} style={styles.svg}>
                <Defs>
                    <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={lineColor} stopOpacity={0.3} />
                        <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </LinearGradient>
                </Defs>

                {/* Area fill */}
                <Path
                    d={chartData.areaPath}
                    fill={`url(#${gradientId})`}
                />

                {/* Main line */}
                <Path
                    d={chartData.path}
                    stroke={lineColor}
                    strokeWidth={2.5}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Crosshair when interacting */}
                {isInteracting && touchPosition && (
                    <>
                        {/* Vertical line */}
                        <Line
                            x1={touchPosition.x}
                            y1={0}
                            x2={touchPosition.x}
                            y2={height}
                            stroke={lineColor}
                            strokeWidth={1}
                            opacity={0.4}
                            strokeDasharray="4,4"
                        />
                        {/* Glow effect behind point */}
                        <Circle
                            cx={touchPosition.x}
                            cy={touchPosition.y}
                            r={10}
                            fill={lineColor}
                            opacity={0.25}
                        />
                        {/* Point indicator */}
                        <Circle
                            cx={touchPosition.x}
                            cy={touchPosition.y}
                            r={5}
                            fill={lineColor}
                            stroke="#FFFFFF"
                            strokeWidth={2}
                        />
                    </>
                )}

                {/* Live blinking dot at the end of the chart */}
                {showLiveDot && lastPoint && !isInteracting && (
                    <>
                        {/* Outer glow - animated */}
                        <AnimatedCircle
                            cx={lastPoint.x}
                            cy={lastPoint.y}
                            r={pulseAnim.interpolate({
                                inputRange: [1, 1.4],
                                outputRange: [8, 16],
                            })}
                            fill={lineColor}
                            opacity={glowAnim}
                        />
                        {/* Inner solid dot */}
                        <Circle
                            cx={lastPoint.x}
                            cy={lastPoint.y}
                            r={5}
                            fill={lineColor}
                            stroke="#FFFFFF"
                            strokeWidth={2}
                        />
                    </>
                )}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        borderRadius: 12,
        position: 'relative',
    },
    svg: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    placeholder: {
        flex: 1,
        borderRadius: 12,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderLine: {
        width: '80%',
        height: 2,
        backgroundColor: Theme.border,
        borderRadius: 1,
    },
});

export default MiniChart;
