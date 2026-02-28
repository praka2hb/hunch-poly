'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { fetchCandlesticksByMint, fetchMarketDetails, fetchEventDetails, Market, EventDetails, CandlestickData } from '../lib/api';
import SocialPriceChart, { TradeEntry } from './SocialPriceChart';
import { useTheme } from './ThemeProvider';
import TradeDrawer from './TradeDrawer';

interface FeedChartItemProps {
    trade: TradeEntry; // Single trade
    marketTicker: string;
    quote?: string | null; // Optional quote/comment from trader
}

// Helper to format time ago
function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}d`;
}

// Format amount from smallest unit
function formatAmount(amount: string) {
    const num = parseFloat(amount) / 1_000_000;
    if (num >= 1000) {
        return `${(num / 1000).toFixed(1)}K`;
    }
    return num.toFixed(0);
}

// Format currency display
function formatCurrency(amount: string) {
    const num = parseFloat(amount) / 1_000_000;
    return `$${num.toFixed(0)}`;
}

// Helper to extract mint from market accounts
function getMintFromAccounts(market: Market, side: 'yes' | 'no'): string | null {
    // Determine which mint to retrieve based on the trade side
    const mintKey = side === 'yes' ? 'yesMint' : 'noMint';

    // First, check if the mint exists directly on the market object
    if (side === 'yes' && market.yesMint) {
        console.log(`[getMintFromAccounts] Using direct market.yesMint: ${market.yesMint}`);
        return market.yesMint;
    }
    if (side === 'no' && market.noMint) {
        console.log(`[getMintFromAccounts] Using direct market.noMint: ${market.noMint}`);
        return market.noMint;
    }

    // Fall back to checking the accounts structure
    const accounts = market.accounts;
    if (!accounts) {
        console.warn(`No ${mintKey} found on market and no accounts structure`, market);
        return null;
    }

    if (typeof accounts === 'object') {
        // Check direct structure first (accounts.yesMint or accounts.noMint)
        if (mintKey in accounts && typeof (accounts as any)[mintKey] === 'string') {
            console.log(`[getMintFromAccounts] Using accounts.${mintKey}: ${(accounts as any)[mintKey]}`);
            return (accounts as any)[mintKey];
        }

        // Iterate through nested collateral entries (e.g., CASH, USDC)
        // Each collateral type has its own yesMint and noMint
        const collateralKeys = Object.keys(accounts);
        for (const collateralKey of collateralKeys) {
            const entry = (accounts as any)[collateralKey];
            if (entry && typeof entry === 'object') {
                // Check if this entry has the specific mint we're looking for
                if (mintKey in entry && typeof entry[mintKey] === 'string') {
                    const mintValue = entry[mintKey];
                    console.log(`[getMintFromAccounts] Found ${mintKey} in collateral ${collateralKey}: ${mintValue}`);
                    return mintValue;
                }
            }
        }
    }

    console.warn(`Could not find ${mintKey} in market for side ${side}`, {
        yesMint: market.yesMint,
        noMint: market.noMint,
        accounts
    });
    return null;
}

export default function FeedChartItem({ trade, marketTicker, quote }: FeedChartItemProps) {
    const router = useRouter();
    const { theme } = useTheme();
    const [market, setMarket] = useState<Market | null>(null);
    const [event, setEvent] = useState<EventDetails | null>(null);
    const [candlesticks, setCandlesticks] = useState<CandlestickData[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [hoveredPrice, setHoveredPrice] = useState<number | null>(null);
    const [isMobile, setIsMobile] = useState(false);
    const [showTradeDrawer, setShowTradeDrawer] = useState(false);

    // Stable callback for price changes
    const handlePriceChange = useCallback((price: number | null) => {
        setHoveredPrice(price);
    }, []);

    // Detect mobile viewport
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 640); // sm breakpoint
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Fetch market, event, and candlestick data based on trade side
    useEffect(() => {
        let mounted = true;

        async function loadData() {
            try {
                setLoading(true);
                setError(null);

                // 1. Fetch market details
                const marketData = await fetchMarketDetails(marketTicker);
                if (!mounted) return;
                setMarket(marketData);

                // 2. Fetch event details if available
                if (marketData.eventTicker) {
                    try {
                        const eventData = await fetchEventDetails(marketData.eventTicker);
                        if (mounted) setEvent(eventData);
                    } catch (e) {
                        console.warn('Failed to fetch event details:', e);
                    }
                }

                // 3. Use the correct mint based on trade side
                const tradeSide = trade.side as 'yes' | 'no';
                const mint = getMintFromAccounts(marketData, tradeSide);

                console.log(`[FeedChartItem] Trade side: ${tradeSide}, Mint: ${mint}`);

                if (mint) {
                    // Get data - 3 days on mobile, 7 days on desktop
                    const now = Math.floor(Date.now() / 1000);
                    const daysToFetch = isMobile ? 3 : 7;
                    const startTime = now - daysToFetch * 24 * 60 * 60;

                    const candleData = await fetchCandlesticksByMint(mint, {
                        startTs: startTime,
                        endTs: now,
                        periodInterval: 60, // Hourly intervals for smooth chart
                    });

                    if (mounted && candleData.candlesticks) {
                        setCandlesticks(candleData.candlesticks);
                    }
                } else {
                    console.error(`[FeedChartItem] No mint found for trade side: ${tradeSide}`);
                }


                setLoading(false);
            } catch (err: any) {
                console.error('Error loading feed chart data:', err);
                if (mounted) {
                    setError(err.message || 'Failed to load data');
                    setLoading(false);
                }
            }
        }

        loadData();
        return () => { mounted = false; };
    }, [marketTicker, trade.side, isMobile]);

    // Display name for trader
    const displayName = trade.user.displayName ||
        `${trade.user.walletAddress.slice(0, 4)}...${trade.user.walletAddress.slice(-4)}`;

    // Get contextual market labels
    // yesSubTitle/noSubTitle are what the user "predicted" (e.g., "Los Angeles R")
    const predictionLabel = trade.side === 'yes'
        ? (market?.yesSubTitle || 'Yes')
        : (market?.noSubTitle || 'No');
    // Event title for the chart card header (e.g., "Pro Football Championship")
    const eventTitle = event?.title || market?.title || marketTicker;
    const eventImage = event?.imageUrl;

    // Calculate current price from last candlestick
    const currentPrice = candlesticks.length > 0
        ? candlesticks[candlesticks.length - 1].price.close
        : null;

    // Handle click to navigate to event (for chart area)
    const handleClick = () => {
        if (market?.eventTicker) {
            router.push(`/event/${encodeURIComponent(market.eventTicker)}`);
        }
    };

    // Handle trade button click - open drawer
    const handleTradeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (market) {
            setShowTradeDrawer(true);
        }
    };

    // Navigate to user profile
    const handleUserClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Use displayName (username) if available, otherwise fall back to userId
        const username = trade.user.displayName || trade.userId;
        router.push(`/user/${encodeURIComponent(username)}`);
    };

    // Calculate PnL (mock calculation based on current price vs entry)
    const calculatePnL = (priceToUse: number | null) => {
        const price = priceToUse || currentPrice;
        if (!price || candlesticks.length === 0) return { value: 0, percent: 0 };
        // Find the price at trade time
        const tradeTime = Math.floor(new Date(trade.createdAt).getTime() / 1000);
        let entryPrice = candlesticks[0].price.close || 50;
        for (const c of candlesticks) {
            if (c.end_period_ts <= tradeTime) {
                entryPrice = c.price.close || entryPrice;
            }
        }
        const amount = parseFloat(trade.amount) / 1_000_000;
        const priceDiff = price - entryPrice;
        const pnlPercent = entryPrice > 0 ? (priceDiff / entryPrice) * 100 : 0;
        // Adjust based on side
        const adjustedPnl = trade.side === 'yes' ? pnlPercent : -pnlPercent;
        const totalValue = amount * (1 + adjustedPnl / 100);
        return { value: totalValue, percent: adjustedPnl };
    };

    const pnl = calculatePnL(hoveredPrice);

    // Determine chart color based on PnL
    const chartColor = pnl.percent < 0 ? '#EF4444' : '#22C55E'; // Red if negative, green if positive

    // Loading state
    if (loading) {
        return (
            <div className="w-full">
                {/* Username & Comment Skeleton - Outside Card */}
                <div className="mb-3 px-2">
                    <div className="flex items-start gap-3">
                        <div className="w-12 h-12 rounded-full bg-[var(--surface-hover)] animate-pulse" />
                        <div className="flex-1">
                            <div className="h-4 w-2/3 bg-[var(--surface-hover)] rounded animate-pulse mb-2" />
                            <div className="h-3 w-1/3 bg-[var(--surface-hover)] rounded animate-pulse" />
                        </div>
                    </div>
                </div>
                {/* Card Skeleton - Starts below username/comment, aligned with them */}
                <div className="ml-[56px]">
                    <div className="rounded-3xl border-2 border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden">
                        <div className="h-[160px] bg-[var(--surface-hover)]/50 animate-pulse mx-4 rounded-xl mt-4" />
                        <div className="p-4 flex gap-4">
                            <div className="h-10 w-24 bg-[var(--surface-hover)] rounded animate-pulse" />
                            <div className="h-10 w-20 bg-[var(--surface-hover)] rounded animate-pulse" />
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // Error state
    if (error || candlesticks.length === 0) {
        return null; // Silent fail for chart items without data
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full"
        >
            {/* Username & Comment - Outside Card */}
            <div className="mb-3 px-2 relative">
                <div className="flex items-start gap-3">
                    {/* User Avatar */}
                    <button
                        onClick={handleUserClick}
                        className="flex-shrink-0 cursor-pointer"
                    >
                        <img
                            src={trade.user.avatarUrl || '/default.png'}
                            alt={displayName}
                            className="w-12 h-12 rounded-full border-2 border-[var(--border-color)]"
                        />
                    </button>

                    {/* Username & Comment */}
                    <div className="flex-1 min-w-0">
                        <button
                            onClick={handleUserClick}
                            className={`cursor-pointer ${quote && quote.trim().length > 0
                                    ? 'font-semibold text-[var(--text-secondary)] text-sm'
                                    : 'font-bold text-[var(--text-primary)] text-lg'
                                }`}
                            style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
                        >
                            {displayName}
                        </button>
                        {quote && quote.trim().length > 0 && (
                            <p className="text-[var(--text-primary)] text-xl font-medium mt-1">
                                "{quote}"
                            </p>
                        )}
                    </div>
                </div>
            </div>

            {/* Card Component - Starts below username/comment, aligned with them */}
            <div className="ml-[56px]">
                <div
                    className="rounded-3xl border-2 border-[var(--border-color)] bg-[var(--card-bg)] overflow-visible relative pt-6"
                    style={{
                        boxShadow: theme === 'dark'
                            ? '0 4px 24px rgba(0,0,0,0.4)'
                            : '0 4px 24px rgba(0,0,0,0.1)',
                    }}
                >
                    {/* Ticket-style Amount Tag - Top Right Corner - Sticker Overlay */}
                    <div
                        className="absolute -top-2 -right-2 z-20 pointer-events-none"
                        style={{ transform: 'rotate(12deg) scale(1.3)' }}
                    >
                        <div
                            className="vast-shadow-regular relative px-5 py-3 font-black text-lg sm:text-xl text-[#0a0a0a]"
                            style={{
                                background: 'linear-gradient(135deg, #FFE566 0%, #FFD93D 50%, #F4C430 100%)',
                                clipPath: 'polygon(8% 0%, 100% 0%, 100% 100%, 8% 100%, 0% 50%)',
                                boxShadow: '0 4px 12px rgba(255,217,61,0.4), 0 2px 8px rgba(0,0,0,0.2)',
                            }}
                        >
                            {formatCurrency(trade.amount)}
                        </div>
                    </div>

                    {/* Time Posted - Top Right */}
                    <div className="absolute top-4 right-4 z-10 pr-12 sm:pr-4">
                        <span className="text-xs text-[var(--text-tertiary)] font-medium">
                            {formatTimeAgo(trade.createdAt)} ago
                        </span>
                    </div>

                    {/* Position Label - YES/NO on Market */}
                    <div className="px-4 pb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span
                                className={`luckiest-guy-regular font-black text-3xl sm:text-5xl ${trade.side === 'yes' ? 'bg-clip-text bg-gradient-to-r from-lime-500 to-green-400 text-transparent' : 'bg-clip-text bg-gradient-to-r from-red-500 to-pink-500 text-transparent'}`}
                            >
                                {trade.side.toUpperCase()}
                            </span>
                            <span className="text-[var(--text-tertiary)] text-lg font-medium">on</span>
                            <div
                                className="px-3 py-1.5 rounded-lg bg-[var(--surface-hover)] border border-[var(--border-color)]"
                                style={{ maxWidth: 'calc(100% - 100px)' }}
                            >
                                <span className="text-[var(--text-primary)] text-sm font-semibold truncate block">
                                    {predictionLabel}
                                </span>
                                <span className="text-[var(--text-secondary)] text-xs truncate block">
                                    {eventTitle}
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Chart Area */}
                    <div
                        onClick={handleClick}
                        className="mx-2 sm:mx-4 rounded-2xl overflow-hidden cursor-pointer relative"
                        style={{
                            background: pnl.percent < 0
                                ? theme === 'dark'
                                    ? 'linear-gradient(180deg, transparent 0%, rgba(239,68,68,0.08) 100%)'
                                    : 'linear-gradient(180deg, transparent 0%, rgba(239,68,68,0.04) 100%)'
                                : theme === 'dark'
                                    ? 'linear-gradient(180deg, transparent 0%, rgba(34,197,94,0.08) 100%)'
                                    : 'linear-gradient(180deg, transparent 0%, rgba(34,197,94,0.04) 100%)',
                        }}
                    >
                        {/* Chart */}
                        <div className="pt-2 h-[100px] sm:h-[130px]">
                            <SocialPriceChart
                                candlesticks={candlesticks}
                                trades={[trade]}
                                height={130}
                                lineColor={chartColor}
                                onHoverPriceChange={handlePriceChange}
                            />
                        </div>
                    </div>

                    {/* Footer - Total Value, PnL & APE IN Button */}
                    <div className="p-4 pt-4 flex items-end justify-between">
                        {/* Stats */}
                        <div className="flex items-center gap-4">
                            {/* Total Value */}
                            <div>
                                <p className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide">Total Value</p>
                                <p className="text-[var(--text-primary)] text-xl font-black" style={{ fontFamily: 'system-ui' }}>
                                    {/* ${pnl.value.toFixed(0)} */} $82.4
                                </p>
                            </div>

                            {/* Divider */}
                            <div className="w-px h-10 bg-[var(--border-color)]" />

                            {/* PnL */}
                            <div>
                                <p className="text-[var(--text-tertiary)] text-xs font-medium uppercase tracking-wide">PnL</p>
                                <p className={`text-xl font-black ${pnl.percent >= 0 ? 'text-[#22C55E]' : 'text-[#EF4444]'}`} style={{ fontFamily: 'system-ui' }}>
                                    {pnl.percent >= 0 ? '+' : ''}{pnl.percent.toFixed(1)}%
                                </p>
                            </div>
                        </div>

                    {/* APE IN Button */}
                    <motion.button
                        onClick={handleTradeClick}
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        className=" bg-yellow-300 px-5 py-2.5 text-black border-black border-2  font-extrabold text-xl rounded-lg"
                       
                    >
                        Trade
                    </motion.button>
                </div>
                </div>
            </div>

            {/* Trade Drawer */}
            {market && (
                <TradeDrawer
                    isOpen={showTradeDrawer}
                    onClose={() => setShowTradeDrawer(false)}
                    market={market}
                    event={event}
                    initialSide={trade.side as 'yes' | 'no'}
                />
            )}
        </motion.div>
    );
}
