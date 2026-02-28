'use client';

import { useState, useEffect, useMemo } from 'react';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { fetchEventCandlesticks, fetchCandlesticksByMint, Market, CandlestickData } from '../lib/api';
import { USDC_MINT } from '../lib/tradeApi';

interface EventDetailChartProps {
    eventTicker: string;
    markets: Market[];
    selectedMarketTicker?: string | null;
    onMarketSelect?: (ticker: string) => void;
    className?: string;
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

// Colors for multi-line chart
const CHART_COLORS = ['#06b6d4', '#d946ef', '#8b5cf6', '#f59e0b'];

// Custom tooltip component
const CustomTooltip = ({ active, payload, label, isSingleMarket }: any) => {
    if (active && payload && payload.length) {
        const date = new Date(label * 1000);
        const dateStr = new Intl.DateTimeFormat('en-US', {
            month: 'short',
            day: 'numeric',
            hour: 'numeric',
            minute: 'numeric',
        }).format(date);

        if (isSingleMarket) {
            return (
                <div className="bg-[rgba(15,15,20,0.95)] border border-[var(--border-color)]/20 rounded-lg p-2.5 shadow-2xl backdrop-blur-xl">
                    <p className="text-[10px] font-bold text-[var(--text-tertiary)] mb-1 uppercase tracking-wider">
                        {dateStr}
                    </p>
                    <p className="text-sm font-bold text-[var(--text-primary)]">
                        {payload[0].value?.toFixed(1)}%
                    </p>
                </div>
            );
        }

        const sortedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);
        return (
            <div className="bg-[rgba(15,15,20,0.95)] border border-[var(--border-color)]/20 rounded-lg p-3 shadow-2xl backdrop-blur-xl min-w-[160px]">
                <p className="text-[10px] font-bold text-[var(--text-tertiary)] mb-2 uppercase tracking-wider border-b border-[var(--border-color)]/10 pb-1">
                    {dateStr}
                </p>
                <div className="flex flex-col gap-1.5">
                    {sortedPayload.map((entry: any) => (
                        <div key={entry.name} className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-1.5 min-w-0">
                                <div
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: entry.color }}
                                />
                                <span className="text-[11px] text-[var(--text-secondary)] truncate max-w-[90px]">
                                    {entry.name}
                                </span>
                            </div>
                            <span className="text-xs font-bold text-[var(--text-primary)] font-mono">
                                {entry.value?.toFixed(1)}%
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        );
    }
    return null;
};

// Get mint address from market accounts
function getMintFromMarket(market: Market, side: 'yes' | 'no'): string | null {
    const mintKey = side === 'yes' ? 'yesMint' : 'noMint';

    if (side === 'yes' && market.yesMint) return market.yesMint;
    if (side === 'no' && market.noMint) return market.noMint;

    const accounts = market.accounts;
    if (!accounts || typeof accounts !== 'object') return null;

    // Try USDC mint first
    const usdcAccount = (accounts as any)[USDC_MINT];
    if (usdcAccount && usdcAccount[mintKey]) {
        return usdcAccount[mintKey];
    }

    // Fallback to any available account
    for (const key of Object.keys(accounts)) {
        const entry = (accounts as any)[key];
        if (entry && typeof entry === 'object' && entry[mintKey]) {
            return entry[mintKey];
        }
    }

    return null;
}

export default function EventDetailChart({
    eventTicker,
    markets,
    selectedMarketTicker,
    onMarketSelect,
    className = ''
}: EventDetailChartProps) {
    const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
    const [singleChartData, setSingleChartData] = useState<CandlestickData[]>([]);
    const [activeMarkets, setActiveMarkets] = useState<ActiveMarket[]>([]);
    const [loading, setLoading] = useState(true);
    const [yDomain, setYDomain] = useState<[number, number]>([0, 100]);

    // Filter active markets
    const activeMarketsFiltered = useMemo(() =>
        markets.filter(m =>
            m.status !== 'finalized' &&
            m.status !== 'resolved' &&
            m.status !== 'closed'
        ).sort((a, b) => {
            const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
            const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
            return bChance - aChance;
        }), [markets]
    );

    // Determine if markets have the same resolving date
    const hasSameResolvingDate = useMemo(() => {
        if (activeMarketsFiltered.length <= 1) return true;

        const closeTimes = activeMarketsFiltered
            .map(m => m.closeTime)
            .filter(Boolean);

        if (closeTimes.length === 0) return true;

        const uniqueCloseTimes = new Set(closeTimes);
        return uniqueCloseTimes.size === 1;
    }, [activeMarketsFiltered]);

    // Get currently selected market for different resolving dates
    const selectedMarket = useMemo(() => {
        if (hasSameResolvingDate) return null;
        return activeMarketsFiltered.find(m => m.ticker === selectedMarketTicker)
            || activeMarketsFiltered[0];
    }, [hasSameResolvingDate, activeMarketsFiltered, selectedMarketTicker]);

    // Load chart data for SAME resolving date (multi-line)
    useEffect(() => {
        if (!hasSameResolvingDate || !eventTicker || activeMarketsFiltered.length === 0) return;

        let mounted = true;
        setLoading(true);

        const loadMultiLineData = async () => {
            try {
                const now = Math.floor(Date.now() / 1000);
                const start = now - 7 * 24 * 60 * 60; // 7 days

                const data = await fetchEventCandlesticks(eventTicker, {
                    startTs: start,
                    endTs: now,
                    periodInterval: 60
                });

                if (!mounted || !data.market_candlesticks || !data.market_tickers) {
                    setLoading(false);
                    return;
                }

                // Get top 4 markets
                const top4 = activeMarketsFiltered.slice(0, 4);
                const topTickers = new Set(top4.map(m => m.ticker));

                // Find indices matching our top markets
                const marketIndices = data.market_tickers
                    .map((ticker, index) => ({ ticker, index }))
                    .filter(item => topTickers.has(item.ticker));

                if (marketIndices.length === 0) {
                    setLoading(false);
                    return;
                }

                // Build active markets metadata
                const active = marketIndices.map(({ ticker }, i) => {
                    const market = markets.find(m => m.ticker === ticker);
                    let title = market?.yesSubTitle || market?.title || ticker;
                    if (title === 'Yes' && market?.title) title = market.title;
                    // Truncate long titles
                    if (title.length > 20) title = title.slice(0, 17) + '...';

                    return {
                        ticker,
                        color: CHART_COLORS[i % CHART_COLORS.length],
                        title
                    };
                });
                setActiveMarkets(active);

                // Merge data series
                const allTimestamps = new Set<number>();
                const marketDataMap = new Map<string, Map<number, number>>();

                marketIndices.forEach(({ ticker, index }) => {
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

                const sortedTimestamps = Array.from(allTimestamps).sort((a, b) => a - b);
                const mergedData = sortedTimestamps.map(ts => {
                    const point: ChartDataPoint = { timestamp: ts };
                    marketIndices.forEach(({ ticker }) => {
                        const price = marketDataMap.get(ticker)?.get(ts);
                        if (price !== undefined) {
                            point[ticker] = price;
                        }
                    });
                    return point;
                });

                setChartData(mergedData);

                // Calculate Y domain
                let minVal = 100, maxVal = 0;
                mergedData.forEach(point => {
                    Object.entries(point).forEach(([key, value]) => {
                        if (key !== 'timestamp' && typeof value === 'number') {
                            minVal = Math.min(minVal, value);
                            maxVal = Math.max(maxVal, value);
                        }
                    });
                });

                const range = maxVal - minVal;
                const padding = Math.max(range * 0.15, 5);
                let domainMin = Math.max(0, Math.floor((minVal - padding) / 5) * 5);
                let domainMax = Math.min(100, Math.ceil((maxVal + padding) / 5) * 5);

                if (domainMax - domainMin >= 40) {
                    domainMin = 0;
                    domainMax = 100;
                }

                setYDomain([domainMin, domainMax]);
                setLoading(false);

            } catch (err) {
                console.error('Error loading multi-line chart:', err);
                setLoading(false);
            }
        };

        loadMultiLineData();
        return () => { mounted = false; };
    }, [hasSameResolvingDate, eventTicker, activeMarketsFiltered, markets]);

    // Load chart data for DIFFERENT resolving dates (single market)
    useEffect(() => {
        if (hasSameResolvingDate || !selectedMarket) return;

        let mounted = true;
        setLoading(true);

        const loadSingleMarketData = async () => {
            try {
                const mint = getMintFromMarket(selectedMarket, 'yes');
                if (!mint) {
                    setLoading(false);
                    return;
                }

                const now = Math.floor(Date.now() / 1000);
                const start = now - 7 * 24 * 60 * 60;

                const data = await fetchCandlesticksByMint(mint, {
                    startTs: start,
                    endTs: now,
                    periodInterval: 60
                });

                if (!mounted) return;

                if (data.candlesticks && data.candlesticks.length > 0) {
                    setSingleChartData(data.candlesticks);

                    // Calculate Y domain
                    let minVal = 100, maxVal = 0;
                    data.candlesticks.forEach(c => {
                        if (c.price.close !== null) {
                            minVal = Math.min(minVal, c.price.close);
                            maxVal = Math.max(maxVal, c.price.close);
                        }
                    });

                    const range = maxVal - minVal;
                    const padding = Math.max(range * 0.15, 5);
                    let domainMin = Math.max(0, Math.floor((minVal - padding) / 5) * 5);
                    let domainMax = Math.min(100, Math.ceil((maxVal + padding) / 5) * 5);

                    if (domainMax - domainMin >= 40) {
                        domainMin = 0;
                        domainMax = 100;
                    }

                    setYDomain([domainMin, domainMax]);
                }

                setLoading(false);
            } catch (err) {
                console.error('Error loading single market chart:', err);
                setLoading(false);
            }
        };

        loadSingleMarketData();
        return () => { mounted = false; };
    }, [hasSameResolvingDate, selectedMarket]);

    // Convert single market data to chart format
    const singleChartDataConverted = useMemo(() => {
        return singleChartData
            .filter(c => c.price.close !== null)
            .map(c => ({
                timestamp: c.end_period_ts,
                price: c.price.close as number
            }));
    }, [singleChartData]);

    // Loading state
    if (loading) {
        return (
            <div className={`${className}`}>
                <div className="h-[180px] bg-[var(--surface-hover)]/30 rounded-xl animate-pulse" />
            </div>
        );
    }

    // No data state
    if ((hasSameResolvingDate && chartData.length === 0) ||
        (!hasSameResolvingDate && singleChartDataConverted.length === 0)) {
        return null;
    }

    return (
        <div className={`${className}`}>
            {/* Market Toggle Tabs - Only for different resolving dates */}
            {!hasSameResolvingDate && activeMarketsFiltered.length > 1 && (
                <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide mb-2">
                    {activeMarketsFiltered.slice(0, 6).map(market => {
                        const isSelected = market.ticker === selectedMarket?.ticker;
                        const label = market.yesSubTitle || market.noSubTitle || 'Market';

                        return (
                            <button
                                key={market.ticker}
                                onClick={() => onMarketSelect?.(market.ticker)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all duration-200
                                    ${isSelected
                                        ? 'bg-white text-white shadow-lg shadow-white/20'
                                        : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]/80 hover:text-[var(--text-primary)]'
                                    }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            )}

            {/* Chart Container */}
            <div className="h-[160px] rounded-xl border border-[var(--border-color)]/10 bg-[var(--surface)]/30 p-1 relative overflow-hidden">
                {/* Subtle gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[var(--surface)]/10 pointer-events-none" />

                <ResponsiveContainer width="100%" height="100%">
                    {hasSameResolvingDate ? (
                        // Multi-line chart for same resolving date
                        <LineChart data={chartData} margin={{ top: 10, right: 40, bottom: 5, left: 5 }}>
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
                                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                                tickFormatter={(value) => `${value}%`}
                                axisLine={false}
                                tickLine={false}
                                width={32}
                            />
                            <Tooltip
                                content={<CustomTooltip isSingleMarket={false} />}
                                cursor={{ stroke: 'var(--text-tertiary)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }}
                            />
                            {activeMarkets.map((m) => (
                                <Line
                                    key={m.ticker}
                                    type="monotone"
                                    dataKey={m.ticker}
                                    name={m.title}
                                    stroke={m.color}
                                    strokeWidth={2}
                                    dot={false}
                                    activeDot={{
                                        r: 4,
                                        strokeWidth: 0,
                                        fill: m.color,
                                    }}
                                    connectNulls={true}
                                    isAnimationActive={true}
                                    animationDuration={800}
                                />
                            ))}
                        </LineChart>
                    ) : (
                        // Single area chart for different resolving dates
                        <AreaChart data={singleChartDataConverted} margin={{ top: 10, right: 40, bottom: 5, left: 5 }}>
                            <defs>
                                <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#06b6d4" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#06b6d4" stopOpacity={0.05} />
                                </linearGradient>
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
                                tick={{ fontSize: 10, fill: 'var(--text-tertiary)' }}
                                tickFormatter={(value) => `${value}%`}
                                axisLine={false}
                                tickLine={false}
                                width={32}
                            />
                            <Tooltip
                                content={<CustomTooltip isSingleMarket={true} />}
                                cursor={{ stroke: 'var(--text-tertiary)', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }}
                            />
                            <Area
                                type="monotone"
                                dataKey="price"
                                stroke="#06b6d4"
                                strokeWidth={2}
                                fill="url(#chartGradient)"
                                isAnimationActive={true}
                                animationDuration={800}
                            />
                        </AreaChart>
                    )}
                </ResponsiveContainer>
            </div>

            {/* Legend for multi-line chart */}
            {hasSameResolvingDate && activeMarkets.length > 0 && (
                <div className="flex flex-wrap gap-3 mt-2 px-1">
                    {activeMarkets.map(m => (
                        <div key={m.ticker} className="flex items-center gap-1.5">
                            <div
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: m.color }}
                            />
                            <span className="text-[10px] text-[var(--text-secondary)] font-medium">
                                {m.title}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
