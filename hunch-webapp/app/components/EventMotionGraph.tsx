'use client';

import { useEffect, useState } from 'react';
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchEventCandlesticks, Market } from '../lib/api';

interface EventMotionGraphProps {
    eventTicker: string;
    markets: Market[];
    className?: string;
    onHoverValues?: (values: Record<string, number> | null) => void;
}

interface ChartDataPoint {
    timestamp: number;
    [key: string]: number;
}

interface ActiveMarket {
    ticker: string;
    color: string;
    title: string;
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(label * 1000);
        const dateStr = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
        }).format(date);

        // Sort payload by value (price) descending
        const sortedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);

        return (
            <div className="bg-[rgba(15,15,20,0.95)] border border-[var(--border-color)]/20 rounded-lg p-3 shadow-2xl backdrop-blur-xl min-w-[180px]">
                <p className="text-[10px] font-bold text-[var(--text-tertiary)] mb-2 uppercase tracking-wider border-b border-[var(--border-color)]/10 pb-1">
                    {dateStr}
                </p>
                <div className="flex flex-col gap-2">
                    {sortedPayload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center justify-between gap-3 group">
                            <div className="flex items-center gap-2 min-w-0">
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0 shadow-[0_0_8px_rgba(0,0,0,0.5)]"
                                    style={{ backgroundColor: entry.color, boxShadow: `0 0 6px ${entry.color}40` }}
                                />
                                <span className="text-xs font-medium text-[var(--text-secondary)] truncate max-w-[110px] group-hover:text-[var(--text-primary)] transition-colors">
                                    {entry.name}
                                </span>
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)] font-mono bg-[var(--surface)]/50 px-1.5 py-0.5 rounded">
                                {entry.value.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

const CustomLabel = (props: any) => {
    const { x, y, stroke, value, index, dataLength, name } = props;
    // Only render label for the last data point
    if (index === dataLength - 1 && value !== undefined && value !== null) {
        return (
            <g transform={`translate(${x + 5}, ${y})`}>
                <rect x="-2" y="-9" width="80" height="18" fill="var(--card-bg)" opacity="0.85" rx="3" />
                <text
                    x="0"
                    y="4"
                    fill={stroke}
                    fontSize={10}
                    fontWeight="800"
                    textAnchor="start"
                    style={{ filter: 'drop-shadow(0px 1px 1px rgba(0,0,0,0.8))' }}
                >
                    {name} {Math.round(value)}%
                </text>
            </g>
        );
    }
    return null;
};

export default function EventMotionGraph({ eventTicker, markets, className = '', onHoverValues }: EventMotionGraphProps) {
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [activeMarkets, setActiveMarkets] = useState<ActiveMarket[]>([]);
    const [loading, setLoading] = useState(true);
    const [yDomain, setYDomain] = useState<[number, number]>([0, 100]);
    const [yTicks, setYTicks] = useState<number[]>([0, 25, 50, 75, 100]);

    useEffect(() => {
        let mounted = true;

        const loadData = async () => {
            if (!eventTicker || !markets.length) return;

            try {
                // 1. Identify top 3 markets based on highest Yes Bid (Chance)
                // Logic matches EventCard in EventsList.tsx
                const sortedMarkets = markets
                    .filter(m =>
                        m.status !== 'finalized' &&
                        m.status !== 'resolved' &&
                        m.status !== 'closed'
                    )
                    .sort((a, b) => {
                        const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
                        const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
                        return bChance - aChance; // Descending order - highest chance first
                    })
                    .slice(0, 3);

                const topTickers = new Set(sortedMarkets.map(m => m.ticker));

                // 2. Fetch candlesticks (last 7 days, hourly)
                const now = Math.floor(Date.now() / 1000);
                const start = now - 7 * 24 * 60 * 60;

                const data = await fetchEventCandlesticks(eventTicker, {
                    startTs: start,
                    endTs: now,
                    periodInterval: 60
                });

                if (!mounted) return;

                if (!data.market_candlesticks || !data.market_tickers) {
                    setLoading(false);
                    return;
                }

                // 3. Process data for Recharts
                // Colors: Vibrant, high-contrast neon-like colors (first line yellow instead of cyan)
                const colors = ['#facc15', '#d946ef', '#8b5cf6']; // Yellow-400, Fuchsia-500, Violet-500

                // Find indices of top markets
                const marketIndices = data.market_tickers
                    .map((ticker, index) => ({ ticker, index }))
                    .filter(item => topTickers.has(item.ticker));

                // Fallback if no match found in candlesticks
                const indicesToUse = marketIndices.length > 0
                    ? marketIndices
                    : data.market_tickers.slice(0, 3).map((ticker, index) => ({ ticker, index }));

                // Sort indicesToUse to match the order of sortedMarkets (highest chance first)
                indicesToUse.sort((a, b) => {
                    const marketA = sortedMarkets.find(m => m.ticker === a.ticker);
                    const marketB = sortedMarkets.find(m => m.ticker === b.ticker);
                    const chanceA = marketA?.yesBid ? parseFloat(marketA.yesBid) : 0;
                    const chanceB = marketB?.yesBid ? parseFloat(marketB.yesBid) : 0;
                    return chanceB - chanceA;
                });

                // Prepare active markets metadata
                const active = indicesToUse.map(({ ticker }, i) => {
                    const market = markets.find(m => m.ticker === ticker);
                    // Use yesSubTitle for multi-outcome, or title if yesSubTitle is missing.
                    let title = market?.yesSubTitle || market?.title || ticker;
                    if (title === 'Yes' && market?.title) title = market.title;

                    return {
                        ticker,
                        color: colors[i % colors.length],
                        title
                    };
                });
                setActiveMarkets(active);

                if (indicesToUse.length === 0) {
                    setLoading(false);
                    return;
                }

                // 4. Merge Data Series
                // Collect all unique timestamps from all selected markets
                const allTimestamps = new Set<number>();
                const marketDataMap = new Map<string, Map<number, number>>(); // ticker -> timestamp -> price

                indicesToUse.forEach(({ ticker, index }) => {
                    const candles = data.market_candlesticks[index] || [];
                    const priceMap = new Map<number, number>();

                    candles.forEach(c => {
                        if (c.price.close !== null) {
                            allTimestamps.add(c.end_period_ts);
                            priceMap.set(c.end_period_ts, c.price.close);
                        }
                    });
                    marketDataMap.set(ticker, priceMap);
                });

                // Create sorted array of data points
                const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);

                const mergedData = sortedTimestamps.map(ts => {
                    const point: ChartDataPoint = { timestamp: ts };
                    indicesToUse.forEach(({ ticker }) => {
                        const price = marketDataMap.get(ticker)?.get(ts);
                        if (price !== undefined) {
                            point[ticker] = price;
                        }
                    });
                    return point;
                });

                setChartData(mergedData);

                // Calculate dynamic Y-axis domain based on data range
                // Find min/max values across all markets
                let minVal = 100;
                let maxVal = 0;
                mergedData.forEach(point => {
                    Object.entries(point).forEach(([key, value]) => {
                        if (key !== 'timestamp' && typeof value === 'number') {
                            minVal = Math.min(minVal, value);
                            maxVal = Math.max(maxVal, value);
                        }
                    });
                });

                // Add padding (10% of range) for better visualization
                const range = maxVal - minVal;
                const padding = Math.max(range * 0.15, 5); // At least 5% padding

                // Round to nice numbers
                let domainMin = Math.max(0, Math.floor((minVal - padding) / 5) * 5);
                let domainMax = Math.min(100, Math.ceil((maxVal + padding) / 5) * 5);

                // If the range is small (< 40%), zoom in for better visualization
                // Otherwise use full 0-100 range
                const dataRange = domainMax - domainMin;
                if (dataRange >= 40 || (minVal < 20 && maxVal > 80)) {
                    // Wide range or spanning both ends - use full scale
                    domainMin = 0;
                    domainMax = 100;
                }

                // Generate appropriate ticks
                const tickCount = 5;
                const tickStep = (domainMax - domainMin) / (tickCount - 1);
                const ticks = Array.from({ length: tickCount }, (_, i) =>
                    Math.round(domainMin + i * tickStep)
                );

                setYDomain([domainMin, domainMax]);
                setYTicks(ticks);
                setLoading(false);

            } catch (err) {
                console.error('Error loading graph data:', err);
                setLoading(false);
            }
        };

        loadData();

        return () => { mounted = false; };
    }, [eventTicker, markets]);

    if (loading || chartData.length === 0) return null;

    return (
        <div className={`w-full h-full flex flex-col ${className}`}>
            {/* Chart Area - No Legend Box, Inline Labels */}
            <div className="flex-1 min-h-0 rounded-xl border border-[var(--border-color)]/10 bg-[var(--surface)]/5 p-1 relative overflow-hidden">
                {/* Subtle background glow */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--surface)]/10 pointer-events-none" />

                <ResponsiveContainer width="100%" height="100%">
                    <LineChart
                        data={chartData}
                        margin={{ top: 10, right: 60, bottom: 5, left: 5 }}
                        onMouseMove={(state: any) => {
                            const payload = state?.activePayload as any[] | undefined;
                            if (!payload || payload.length === 0) {
                                onHoverValues?.(null);
                                return;
                            }
                            const values: Record<string, number> = {};
                            payload.forEach((entry) => {
                                if (entry && entry.dataKey && typeof entry.value === 'number') {
                                    values[entry.dataKey] = entry.value;
                                }
                            });
                            onHoverValues?.(values);
                        }}
                        onMouseLeave={() => onHoverValues?.(null)}
                    >
                        <defs>
                            {activeMarkets.map((m, i) => (
                                <filter key={`glow-${m.ticker}`} id={`glow-${m.ticker}`} x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            ))}
                        </defs>
                        <CartesianGrid
                            vertical={false}
                            strokeDasharray="4 4"
                            stroke="var(--border-color)"
                            opacity={0.15}
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
                            ticks={yTicks}
                            tick={{ fontSize: 10, fill: 'var(--text-tertiary)', fontWeight: 500 }}
                            tickFormatter={(value) => `${value}%`}
                            axisLine={false}
                            tickLine={false}
                            width={35}
                        />
                        <Tooltip
                            content={<CustomTooltip />}
                            cursor={{ stroke: 'var(--text-tertiary)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }}
                        />
                        {activeMarkets.map((m) => (
                            <Line
                                key={m.ticker}
                                type="monotone"
                                dataKey={m.ticker}
                                name={m.title}
                                stroke={m.color}
                                strokeWidth={2.5}
                                dot={false}
                                activeDot={{
                                    r: 5,
                                    strokeWidth: 0,
                                    fill: m.color,
                                    style: { filter: `drop-shadow(0 0 8px ${m.color})` }
                                }}
                                connectNulls={true}
                                isAnimationActive={true}
                                animationDuration={1500}
                                animationEasing="ease-out"
                                label={(props) => <CustomLabel {...props} marketName={m.title} dataLength={chartData.length} />}
                                style={{ filter: `drop-shadow(0 0 3px ${m.color}40)` }}
                            />
                        ))}
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
