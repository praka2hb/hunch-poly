import { Theme } from '@/constants/theme';
import { CandleData } from '@/lib/types';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle, ClipPath, Defs, Image, Line, LinearGradient, Path, Stop } from 'react-native-svg';

const CHART_GREEN = '#10ff1f';

interface LightChartProps {
    candles: CandleData[];
    width: number;
    height: number;
    isYes?: boolean; // true = green, false = noColor or black (used when colorByTrend is false)
    /** When isYes is false, use this color. Default black for screens; pass '#ef4444' for drawer. */
    noColor?: string;
    /** When true, color by trend for selected timeframe: green if up, pink if down */
    colorByTrend?: boolean;
    entryTimestamp?: number; // seconds
    entryAvatarUri?: string;
    scrubIndex?: number | null;
    showFill?: boolean;
    showGlow?: boolean;
    strokeWidth?: number;
}

/**
 * LightChart - A lightweight, non-interactive chart for social feed
 * No animations, no touch handlers - maximizes performance
 */
export const LightChart: React.FC<LightChartProps> = ({
    candles,
    width,
    height,
    isYes = true,
    noColor,
    colorByTrend = false,
    entryTimestamp,
    entryAvatarUri,
    scrubIndex,
    showFill = true,
    showGlow = true,
    strokeWidth = 2.5,
}) => {
    // Process candle data - memoized for performance
    const chartData = useMemo(() => {
        if (!candles || candles.length === 0) {
            return { path: '', areaPath: '', lastPoint: null, entryPoint: null, gridLines: [], points: [], stride: 1 };
        }

        const rawPrices = candles.map(c => c.close);

        if (rawPrices.length === 0) {
            return { path: '', areaPath: '', lastPoint: null, entryPoint: null, gridLines: [], points: [], stride: 1 };
        }

        const entryIndex = typeof entryTimestamp === 'number'
            ? candles.reduce((closestIndex, candle, index) => {
                const closestDiff = Math.abs(candles[closestIndex].timestamp - entryTimestamp);
                const currentDiff = Math.abs(candle.timestamp - entryTimestamp);
                return currentDiff < closestDiff ? index : closestIndex;
            }, 0)
            : null;
        const entryPrice = entryIndex !== null ? candles[entryIndex].close : null;

        const maxPoints = Math.min(120, Math.max(24, Math.floor(width / 3)));
        const stride = Math.max(1, Math.ceil(rawPrices.length / maxPoints));
        const prices = rawPrices.filter((_, index) => index % stride === 0);
        const rangePrices = entryPrice !== null ? [...prices, entryPrice] : prices;
        const minPrice = Math.min(...rangePrices);
        const maxPrice = Math.max(...rangePrices);
        const pricePadding = Math.max((maxPrice - minPrice) * 0.08, 0.01);
        const minPadded = minPrice - pricePadding;
        const maxPadded = maxPrice + pricePadding;
        const priceRange = maxPadded - minPadded || 0.02;

        // Padding for chart
        const paddingY = height * 0.2;
        const paddingX = 6;
        const paddingRight = 12; // Space for dot
        const chartHeight = height - paddingY * 2;
        const chartWidth = width - paddingRight - paddingX;

        // Generate points for each candle
        const points = prices.map((price, index) => {
            const x = prices.length === 1 ? chartWidth / 2 : (index / (prices.length - 1)) * chartWidth;
            const y = paddingY + chartHeight - ((price - minPadded) / priceRange) * chartHeight;
            return { x: x + paddingX, y };
        });

        const buildSmoothPath = (pathPoints: { x: number; y: number }[]) => {
            if (pathPoints.length === 0) return '';
            if (pathPoints.length === 1) {
                const single = pathPoints[0];
                return `M ${single.x} ${single.y} L ${single.x} ${single.y}`;
            }
            let d = `M ${pathPoints[0].x} ${pathPoints[0].y}`;
            for (let i = 1; i < pathPoints.length; i++) {
                const prev = pathPoints[i - 1];
                const curr = pathPoints[i];
                const midX = (prev.x + curr.x) / 2;
                const midY = (prev.y + curr.y) / 2;
                if (i === 1) {
                    d += ` Q ${prev.x} ${prev.y} ${midX} ${midY}`;
                } else {
                    d += ` T ${midX} ${midY}`;
                }
            }
            const last = pathPoints[pathPoints.length - 1];
            d += ` T ${last.x} ${last.y}`;
            return d;
        };

        // Create smooth line path
        let path = '';
        let areaPath = '';

        if (points.length > 0) {
            path = buildSmoothPath(points);
            const firstPoint = points[0];
            const lastPoint = points[points.length - 1];
            areaPath = `${path} L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;
        }

        const lastPoint = points[points.length - 1];
        const gridLines = [0.25, 0.5, 0.75].map((ratio) => paddingY + chartHeight * ratio);
        const entryPoint = entryIndex !== null && entryPrice !== null
            ? {
                x: paddingX + (rawPrices.length === 1 ? chartWidth / 2 : (entryIndex / (rawPrices.length - 1)) * chartWidth),
                y: paddingY + chartHeight - ((entryPrice - minPadded) / priceRange) * chartHeight,
            }
            : null;
        return { path, areaPath, lastPoint, gridLines, entryPoint, points, stride };
    }, [candles, width, height, entryTimestamp]);

    // Color by trend (up = green, down = pink) for selected timeframe, or by trade side
    const trendUp = useMemo(() => {
        if (!candles || candles.length < 2) return true;
        const first = candles[0].close;
        const last = candles[candles.length - 1].close;
        return last >= first;
    }, [candles]);
    const lineColor = colorByTrend
        ? (trendUp ? CHART_GREEN : Theme.chartNegative)
        : (isYes ? Theme.success : (noColor ?? Theme.error));
    const gradientId = `light-gradient-${colorByTrend ? (trendUp ? 'up' : 'down') : (isYes ? 'yes' : 'no')}`;

    // Render placeholder if no data
    if (!candles || candles.length === 0 || !chartData.path) {
        return (
            <View style={[styles.container, { width, height }]}>
                <View style={styles.placeholder}>
                    <View style={[styles.placeholderLine, { backgroundColor: lineColor }]} />
                </View>
            </View>
        );
    }

    return (
        <View style={[styles.container, { width, height }]}>
            <Svg width={width} height={height} style={styles.svg}>
                <Defs>
                    <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0%" stopColor={lineColor} stopOpacity={0.12} />
                        <Stop offset="100%" stopColor={lineColor} stopOpacity={0} />
                    </LinearGradient>
                </Defs>

                {/* Grid lines removed */}

                {/* Area fill - when scrubbing, only fill left of scrub line */}
                {(() => {
                    const isScrubbing = typeof scrubIndex === 'number' && chartData.points.length > 0;
                    
                    if (isScrubbing) {
                        // Build area path only up to scrub position
                        const scrubPointIndex = Math.min(
                            chartData.points.length - 1,
                            Math.max(0, Math.floor(scrubIndex / Math.max(chartData.stride, 1)))
                        );
                        const scrubPoints = chartData.points.slice(0, scrubPointIndex + 1);
                        
                        if (scrubPoints.length > 0) {
                            const firstPoint = scrubPoints[0];
                            const lastPoint = scrubPoints[scrubPoints.length - 1];
                            let scrubAreaPath = `M ${firstPoint.x} ${firstPoint.y}`;
                            for (let i = 1; i < scrubPoints.length; i++) {
                                scrubAreaPath += ` L ${scrubPoints[i].x} ${scrubPoints[i].y}`;
                            }
                            // Close to bottom
                            scrubAreaPath += ` L ${lastPoint.x} ${height} L ${firstPoint.x} ${height} Z`;
                            
                            return (
                                <Path
                                    d={scrubAreaPath}
                                    fill={`url(#${gradientId})`}
                                />
                            );
                        }
                        return null;
                    }
                    
                    // Normal area fill when not scrubbing
                    if (showFill) {
                        return (
                            <Path
                                d={chartData.areaPath}
                                fill={`url(#${gradientId})`}
                            />
                        );
                    }
                    return null;
                })()}

                {/* Glow line */}
                {showGlow && (
                    <Path
                        d={chartData.path}
                        stroke={lineColor}
                        strokeWidth={Math.max(strokeWidth + 1.5, 3)}
                        opacity={0.18}
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}

                {/* Main line */}
                <Path
                    d={chartData.path}
                    stroke={lineColor}
                    strokeWidth={strokeWidth}
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                />

                {/* Scrub marker */}
                {typeof scrubIndex === 'number' && chartData.points.length > 0 && (
                    (() => {
                        const index = Math.min(
                            chartData.points.length - 1,
                            Math.max(0, Math.floor(scrubIndex / Math.max(chartData.stride, 1)))
                        );
                        const point = chartData.points[index];
                        return (
                            <>
                                <Line
                                    x1={point.x}
                                    y1={0}
                                    x2={point.x}
                                    y2={height}
                                    stroke="#9CA3AF"
                                    strokeOpacity={0.7}
                                    strokeWidth={1}
                                    strokeDasharray="4,4"
                                />
                                {/* Glow */}
                                <Circle
                                    cx={point.x}
                                    cy={point.y}
                                    r={12}
                                    fill={lineColor}
                                    fillOpacity={0.25}
                                />
                                {/* Dot */}
                                <Circle
                                    cx={point.x}
                                    cy={point.y}
                                    r={5}
                                    fill={lineColor}
                                />
                            </>
                        );
                    })()
                )}

                {/* Entry marker */}
                {chartData.entryPoint && (
                    <>
                        {(() => {
                            const avatarRadius = entryAvatarUri ? 9 : 4;
                            const avatarYOffset = entryAvatarUri ? 7 : 0;
                            const entryY = Math.max(avatarRadius + 2, chartData.entryPoint.y - avatarYOffset);
                            return (
                                <>
                        <Line
                            x1={chartData.entryPoint.x}
                            y1={0}
                            x2={chartData.entryPoint.x}
                            y2={height}
                            stroke={lineColor}
                            strokeOpacity={0.2}
                            strokeWidth={1}
                            strokeDasharray="4,4"
                        />
                        {entryAvatarUri ? (
                            <>
                                <Defs>
                                    <ClipPath id={`entry-avatar-${gradientId}`}>
                                        <Circle
                                            cx={chartData.entryPoint.x}
                                            cy={entryY}
                                            r={9}
                                        />
                                    </ClipPath>
                                </Defs>
                                <Circle
                                    cx={chartData.entryPoint.x}
                                    cy={entryY}
                                    r={10}
                                    fill="#FFFFFF"
                                />
                                <Image
                                    x={chartData.entryPoint.x - 9}
                                    y={entryY - 9}
                                    width={18}
                                    height={18}
                                    href={{ uri: entryAvatarUri }}
                                    clipPath={`url(#entry-avatar-${gradientId})`}
                                    preserveAspectRatio="xMidYMid slice"
                                />
                            </>
                        ) : (
                            <>
                                <Circle
                                    cx={chartData.entryPoint.x}
                                    cy={entryY}
                                    r={5}
                                    fill="#FFFFFF"
                                />
                                <Circle
                                    cx={chartData.entryPoint.x}
                                    cy={entryY}
                                    r={4}
                                    fill={lineColor}
                                />
                            </>
                        )}
                                </>
                            );
                        })()}
                    </>
                )}

                {/* Static dot at end */}
                {chartData.lastPoint && (
                    <Circle
                        cx={chartData.lastPoint.x}
                        cy={chartData.lastPoint.y}
                        r={4}
                        fill={lineColor}
                        stroke="#FFFFFF"
                        strokeWidth={1.5}
                    />
                )}
            </Svg>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        overflow: 'hidden',
        borderRadius: 8,
        position: 'relative',
    },
    svg: {
        position: 'absolute',
        top: 0,
        left: 0,
    },
    placeholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    placeholderLine: {
        width: '80%',
        height: 2,
        borderRadius: 1,
        opacity: 0.3,
    },
});

export default LightChart;
