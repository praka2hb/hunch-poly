'use client';

import React, { useMemo, useState, useEffect } from 'react';
import {
    AreaChart,
    Area,
    ResponsiveContainer,
    XAxis,
    YAxis,
    Tooltip,
    CartesianGrid,
} from 'recharts';
import { CandlestickData } from '../lib/api';
import { useTheme } from './ThemeProvider';

// Trade entry for avatar plotting
export interface TradeEntry {
    id: string;
    userId: string;
    side: 'yes' | 'no';
    amount: string;
    createdAt: string; // ISO timestamp
    user: {
        id: string;
        displayName: string | null;
        avatarUrl: string | null;
        walletAddress: string;
    };
}

// Chart data point
interface ChartDataPoint {
    timestamp: number;
    price: number;
    probability: string;
}

// Props
interface SocialPriceChartProps {
    candlesticks: CandlestickData[];
    trades: TradeEntry[];
    className?: string;
    height?: number;
    lineColor?: string; // Custom line color
    onHoverPriceChange?: (price: number | null) => void; // Callback for hover price changes
}

// Default green color for charts
const DEFAULT_GREEN = '#22C55E';

// Clean, minimal tooltip for probability - theme aware
const ProbabilityTooltip = ({ active, payload, onPriceChange }: any) => {
    // Track last price to avoid unnecessary callbacks
    const lastPriceRef = React.useRef<number | null>(null);
    
    // Call callback directly when active state or payload changes
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        if (onPriceChange && data.price !== undefined && data.price !== lastPriceRef.current) {
            lastPriceRef.current = data.price;
            onPriceChange(data.price);
        }
    } else if (onPriceChange && lastPriceRef.current !== null) {
        // Reset when not hovering
        lastPriceRef.current = null;
        onPriceChange(null);
    }

    if (active && payload && payload.length) {
        const data = payload[0].payload;
        const date = new Date(data.timestamp * 1000);
        const dateStr = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(date);

        return (
            <div className="bg-[var(--card-bg)] rounded-lg px-3 py-2 shadow-lg backdrop-blur-sm border border-[var(--border-color)]">
                <p className="text-[10px] text-[var(--text-tertiary)] mb-0.5">
                    {dateStr}
                </p>
                <p className="text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                    {data.probability}
                </p>
            </div>
        );
    }
    return null;
};

export default function SocialPriceChart({
    candlesticks,
    trades,
    className = '',
    height = 180,
    lineColor,
    onHoverPriceChange,
}: SocialPriceChartProps) {
    const [isHovering, setIsHovering] = useState(false);
    const { theme } = useTheme();
    const [isMobile, setIsMobile] = useState(false);
    const [gradientId] = useState(() => `areaGradient-${Math.random().toString(36).substr(2, 9)}`);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 640);
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Use provided color or default green
    const strokeColor = lineColor || DEFAULT_GREEN;
    
    // Theme-aware cursor color
    const cursorColor = theme === 'dark' 
        ? 'rgba(255,255,255,0.15)' 
        : 'rgba(0,0,0,0.15)';

    // Process candlestick data into chart format
    const chartData = useMemo<ChartDataPoint[]>(() => {
        if (!candlesticks || candlesticks.length === 0) return [];

        return candlesticks
            .filter(c => c.price.close !== null)
            .map(c => ({
                timestamp: c.end_period_ts,
                price: c.price.close!,
                probability: `${c.price.close}%`,
            }))
            .sort((a, b) => a.timestamp - b.timestamp);
    }, [candlesticks]);

    // Calculate stable Y domain - fixed range with padding
    const yDomain = useMemo<[number, number]>(() => {
        if (chartData.length === 0) return [30, 80];

        const prices = chartData.map(d => d.price);
        const min = Math.min(...prices);
        const max = Math.max(...prices);

        // Create a stable, rounded range
        const range = max - min;
        const padding = Math.max(range * 0.25, 8);

        // Round to nearest 5 for clean labels
        let domainMin = Math.floor((min - padding) / 5) * 5;
        let domainMax = Math.ceil((max + padding) / 5) * 5;

        // Ensure we stay within 0-100 bounds
        domainMin = Math.max(0, domainMin);
        domainMax = Math.min(100, domainMax);

        // Ensure minimum range for visual stability
        if (domainMax - domainMin < 20) {
            const midpoint = (domainMin + domainMax) / 2;
            domainMin = Math.max(0, Math.floor(midpoint - 15));
            domainMax = Math.min(100, Math.ceil(midpoint + 15));
        }

        return [domainMin, domainMax];
    }, [chartData]);

    // Generate Y-axis ticks for clean percentage labels
    const yTicks = useMemo(() => {
        const [min, max] = yDomain;
        const ticks: number[] = [];
        // Generate 3-4 evenly spaced ticks
        const step = Math.ceil((max - min) / 3 / 5) * 5;
        for (let i = min; i <= max; i += step) {
            ticks.push(i);
        }
        if (ticks[ticks.length - 1] !== max) {
            ticks.push(max);
        }
        return ticks;
    }, [yDomain]);

    // Map trades to chart positions for avatar overlays
    const tradeMarkers = useMemo(() => {
        if (!trades || trades.length === 0 || chartData.length === 0) return [];

        const [minY, maxY] = yDomain;
        const yRange = maxY - minY;

        return trades.map(trade => {
            const tradeTimestamp = Math.floor(new Date(trade.createdAt).getTime() / 1000);

            // Find the closest data point to the trade timestamp
            let closestPoint = chartData[0];
            let minDiff = Math.abs(chartData[0].timestamp - tradeTimestamp);

            for (const point of chartData) {
                const diff = Math.abs(point.timestamp - tradeTimestamp);
                if (diff < minDiff) {
                    minDiff = diff;
                    closestPoint = point;
                }
            }

            // Calculate X position (percentage across the chart)
            const xMin = chartData[0].timestamp;
            const xMax = chartData[chartData.length - 1].timestamp;
            const xRange = xMax - xMin;
            const xPercent = xRange > 0 ? ((tradeTimestamp - xMin) / xRange) * 100 : 0;

            // Calculate Y position (percentage from bottom)
            const yPercent = yRange > 0 ? ((closestPoint.price - minY) / yRange) * 100 : 50;

            return {
                trade,
                xPercent,
                yPercent,
                price: closestPoint.price,
            };
        });
    }, [trades, chartData, yDomain]);

    if (chartData.length === 0) {
        return (
            <div className={`w-full flex items-center justify-center ${className}`} style={{ height }}>
                <p className="text-[var(--text-tertiary)] text-sm">No data</p>
            </div>
        );
    }

    return (
        <div
            className={`w-full ${className} relative`}
            style={{ height }}
            onMouseEnter={() => setIsHovering(true)}
            onMouseLeave={() => setIsHovering(false)}
        >
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                    data={chartData}
                    margin={{ top: 4, right: 8, bottom: 4, left: 4 }}
                >
                    <defs>
                        {/* Gradient fill below the line */}
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={strokeColor} stopOpacity={0.35} />
                            <stop offset="50%" stopColor={strokeColor} stopOpacity={0.15} />
                            <stop offset="100%" stopColor={strokeColor} stopOpacity={0.02} />
                        </linearGradient>
                    </defs>

                    {/* No grid lines */}
                    <CartesianGrid
                        horizontal={false}
                        vertical={false}
                    />

                    <XAxis
                        dataKey="timestamp"
                        hide
                        type="number"
                        domain={['dataMin', 'dataMax']}
                    />

                    <YAxis
                        orientation="right"
                        domain={yDomain}
                        hide={true}
                        width={0}
                    />

                    <Tooltip
                        content={<ProbabilityTooltip onPriceChange={onHoverPriceChange} />}
                        cursor={{
                            stroke: cursorColor,
                            strokeWidth: 1,
                        }}
                    />

                    {/* Area with gradient fill and line on top */}
                    <Area
                        type="monotone"
                        dataKey="price"
                        stroke={strokeColor}
                        strokeWidth={2.5}
                        fill={`url(#${gradientId})`}
                        dot={false}
                        activeDot={isHovering ? {
                            r: 4,
                            strokeWidth: 0,
                            fill: strokeColor,
                        } : false}
                        isAnimationActive={true}
                        animationDuration={800}
                        animationEasing="ease-out"
                    />
                </AreaChart>
            </ResponsiveContainer>

            {/* User Avatar Markers - Positioned below the chart line */}
            {tradeMarkers.map((marker, index) => {
                const amount = (parseFloat(marker.trade.amount) / 1_000_000).toFixed(2);
                const sideColor = marker.trade.side === 'yes' ? '#22d3ee' : '#f472b6';
                
                // Theme-aware colors for tooltip and shadow
                const tooltipBg = theme === 'dark' 
                    ? 'rgba(12, 12, 14, 0.95)' 
                    : 'rgba(255, 255, 255, 0.95)';
                const shadowColor = theme === 'dark' 
                    ? 'rgba(0,0,0,0.4)' 
                    : 'rgba(0,0,0,0.2)';

                // Adjust positioning for mobile
                const avatarSize = isMobile ? 32 : 28; // Larger on mobile
                const bottomOffset = isMobile ? 16 : 20;

                return (
                    <div
                        key={marker.trade.id}
                        className="absolute pointer-events-auto group/avatar"
                        style={{
                            left: `calc(${marker.xPercent}% + 4px)`,
                            bottom: `calc(${marker.yPercent}% - ${bottomOffset}px)`,
                            transform: 'translate(-50%, 0)',
                            zIndex: 10,
                        }}
                    >
                        <div className="relative flex flex-col items-center">
                            {/* Price Label - Shows on Hover */}
                            <div
                                className="mb-1 px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap shadow-lg opacity-0 group-hover/avatar:opacity-100 transition-opacity duration-200"
                                style={{
                                    backgroundColor: tooltipBg,
                                    border: `1px solid ${sideColor}`,
                                    color: sideColor,
                                }}
                            >
                                {marker.price}¢
                            </div>

                            {/* Avatar with Black Border - Larger on mobile */}
                            <img
                                src={marker.trade.user.avatarUrl || '/default.png'}
                                alt=""
                                className="rounded-full border-2 shadow-lg cursor-pointer transition-transform group-hover/avatar:scale-110"
                                style={{
                                    width: `${avatarSize}px`,
                                    height: `${avatarSize}px`,
                                    borderColor: '#000000',
                                    boxShadow: `0 4px 12px ${shadowColor}`,
                                }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
