'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { fetchMarketDetails, fetchEventDetails, Market, EventDetails } from '../lib/api';
import { useTheme } from './ThemeProvider';
import TradeDrawer from './TradeDrawer';

interface SignalFeedItemProps {
    item: {
        id: string;
        type: 'TRADE_MILESTONE' | 'POSITION_CLOSED' | 'NEWS';
        user: {
            id: string;
            displayName: string | null;
            avatarUrl: string | null;
            walletAddress: string;
        } | null;
        marketTicker: string;
        eventTicker: string | null;
        side: 'yes' | 'no' | null;
        milestoneType: string | null;
        milestoneValue: number | null;
        finalPnL: number | null;
        evidence: {
            id: string;
            headline: string | null;
            explanation: string | null;
            classification: string;
            highlightScore: number;
            sourceUrls: string[];
            sourceTitles: string[];
        } | null;
        createdAt: string;
        score: number;
    };
}

// Format time ago
function formatTimeAgo(dateString: string) {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h`;
    return `${Math.floor(diffInSeconds / 86400)}d`;
}

// Get milestone display text
function getMilestoneDisplay(milestoneType: string | null): { emoji: string; text: string; color: string } {
    switch (milestoneType) {
        case 'PNL_PLUS_5':
            return { emoji: '📈', text: '+5%', color: '#22C55E' };
        case 'PNL_PLUS_10':
            return { emoji: '🔥', text: '+10%', color: '#22C55E' };
        case 'PNL_PLUS_20':
            return { emoji: '🚀', text: '+20%', color: '#22C55E' };
        case 'PNL_MINUS_5':
            return { emoji: '📉', text: '-5%', color: '#EF4444' };
        case 'PNL_MINUS_10':
            return { emoji: '⚠️', text: '-10%', color: '#EF4444' };
        case 'POSITION_CLOSED':
            return { emoji: '✅', text: 'Closed', color: '#6366F1' };
        default:
            return { emoji: '📊', text: '', color: '#9CA3AF' };
    }
}

export default function SignalFeedItem({ item }: SignalFeedItemProps) {
    const router = useRouter();
    const { theme } = useTheme();
    const [market, setMarket] = useState<Market | null>(null);
    const [event, setEvent] = useState<EventDetails | null>(null);
    const [loading, setLoading] = useState(true);
    const [showTradeDrawer, setShowTradeDrawer] = useState(false);

    // NEWS items with evidence can render immediately - no need to fetch market data
    const canRenderImmediately = item.type === 'NEWS' && item.evidence;

    // Fetch market and event data (only needed for milestone/trade cards)
    useEffect(() => {
        // Skip fetching if we can render immediately
        if (canRenderImmediately) {
            setLoading(false);
            return;
        }

        let mounted = true;

        async function loadData() {
            try {
                const marketData = await fetchMarketDetails(item.marketTicker);
                if (!mounted) return;
                setMarket(marketData);

                if (marketData.eventTicker || item.eventTicker) {
                    try {
                        const eventData = await fetchEventDetails(marketData.eventTicker || item.eventTicker!);
                        if (mounted) setEvent(eventData);
                    } catch (e) {
                        console.warn('Failed to fetch event details:', e);
                    }
                }
                setLoading(false);
            } catch (err) {
                console.error('Error loading market data:', err);
                if (mounted) setLoading(false);
            }
        }

        loadData();
        return () => { mounted = false; };
    }, [item.marketTicker, item.eventTicker, canRenderImmediately]);

    // Navigate to user profile
    const handleUserClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (!item.user) return;
        const username = item.user.displayName || item.user.id;
        router.push(`/user/${encodeURIComponent(username)}`);
    };

    // Navigate to event
    const handleEventClick = () => {
        const ticker = item.eventTicker || market?.eventTicker;
        if (ticker) {
            router.push(`/event/${encodeURIComponent(ticker)}`);
        }
    };

    // Handle trade button
    const handleTradeClick = (e: React.MouseEvent) => {
        e.stopPropagation();
        if (market) setShowTradeDrawer(true);
    };

    // Display name
    const displayName = item.user?.displayName ||
        (item.user ? `${item.user.walletAddress.slice(0, 4)}...${item.user.walletAddress.slice(-4)}` : 'Hunch');

    const eventTitle = event?.title || market?.title || item.marketTicker;
    const milestone = getMilestoneDisplay(item.milestoneType);

    // Loading skeleton - only show for non-NEWS items
    if (loading && !canRenderImmediately) {
        return (
            <div className="w-full mb-4">
                <div className="flex items-start gap-3 px-2">
                    <div className="w-12 h-12 rounded-full bg-[var(--surface-hover)] animate-pulse" />
                    <div className="flex-1">
                        <div className="h-4 w-3/4 bg-[var(--surface-hover)] rounded animate-pulse mb-2" />
                        <div className="h-3 w-1/2 bg-[var(--surface-hover)] rounded animate-pulse" />
                    </div>
                </div>
            </div>
        );
    }

    // NEWS type - render as news card
    if (item.type === 'NEWS' && item.evidence) {
        return (
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3 }}
                className="w-full mb-6"
            >
                {/* News Card */}
                <div className="flex items-start gap-3 px-2">
                    {/* Hunch Logo */}
                    <div className="flex-shrink-0">
                        <img
                            src="/hunch.jpg"
                            alt="Hunch"
                            className="w-12 h-12 rounded-full border-2 border-[var(--border-color)]"
                        />
                    </div>

                    {/* News Content */}
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <span className="font-semibold text-[var(--text-primary)] text-sm">Hunch</span>
                            <img src="/verified.png" alt="Verified" className="w-4 h-4" />
                            <span className="text-[var(--text-tertiary)] text-xs">· {formatTimeAgo(item.createdAt)} ago</span>
                        </div>

                        {/* Headline */}
                        <p className="text-[var(--text-primary)] text-lg font-semibold leading-tight mb-2">
                            {item.evidence.headline || 'Breaking News'}
                        </p>

                        {/* Explanation */}
                        {item.evidence.explanation && (
                            <p className="text-[var(--text-secondary)] text-sm mb-3">
                                {item.evidence.explanation}
                            </p>
                        )}

                        {/* Event Preview Card */}
                        <div
                            className="rounded-xl border border-[var(--border-color)] bg-[var(--surface-hover)] p-3 mb-3 cursor-pointer hover:bg-[var(--card-bg)] transition-colors"
                            onClick={handleEventClick}
                        >
                            <div className="flex items-center gap-3">
                                {event?.imageUrl && (
                                    <img
                                        src={event.imageUrl}
                                        alt={eventTitle}
                                        className="w-12 h-12 rounded-lg object-cover"
                                    />
                                )}
                                <div className="flex-1 min-w-0">
                                    <p className="text-[var(--text-primary)] text-sm font-medium truncate">{eventTitle}</p>
                                    <p className="text-[var(--text-tertiary)] text-xs">Related market</p>
                                </div>
                                <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </div>
                        </div>

                        {/* Bottom Row: Trade Button (left) + Sources (right) */}
                        <div className="flex items-center justify-between">
                            {/* Trade Button */}
                            <motion.button
                                onClick={handleEventClick}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="bg-yellow-300 px-4 py-2 text-black border-black border-2 font-extrabold text-sm rounded-lg"
                            >
                                Trade
                            </motion.button>

                            {/* Sources */}
                            {item.evidence.sourceUrls && item.evidence.sourceUrls.length > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-[var(--text-tertiary)] text-xs">Sources:</span>
                                    <div className="flex items-center gap-1">
                                        {item.evidence.sourceUrls.slice(0, 3).map((url, idx) => (
                                            <a
                                                key={idx}
                                                href={url}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                onClick={(e) => e.stopPropagation()}
                                                className="text-yellow-500 hover:text-yellow-400 text-xs font-medium underline"
                                            >
                                                [{idx + 1}]
                                            </a>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    // TRADE_MILESTONE or POSITION_CLOSED type
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="w-full mb-6"
        >
            {/* Milestone/Trade Card */}
            <div className="flex items-start gap-3 px-2">
                {/* User Avatar */}
                <button onClick={handleUserClick} className="flex-shrink-0 cursor-pointer">
                    <img
                        src={item.user?.avatarUrl || '/default.png'}
                        alt={displayName}
                        className="w-12 h-12 rounded-full border-2 border-[var(--border-color)]"
                    />
                </button>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    {/* Username + Milestone */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                        <button onClick={handleUserClick} className="font-bold text-[var(--text-primary)] text-base hover:underline">
                            {displayName}
                        </button>
                        <span className="text-[var(--text-secondary)] text-base">is</span>
                        <span
                            className="font-black text-xl"
                            style={{ color: milestone.color }}
                        >
                            {milestone.emoji} {milestone.text}
                        </span>
                    </div>

                    {/* Time */}
                    <p className="text-[var(--text-tertiary)] text-xs mb-3">
                        {formatTimeAgo(item.createdAt)} ago
                    </p>

                    {/* Event Card */}
                    <div
                        onClick={handleEventClick}
                        className="rounded-xl border-2 border-[var(--border-color)] bg-[var(--card-bg)] p-4 cursor-pointer hover:border-yellow-500/50 transition-colors"
                        style={{
                            boxShadow: theme === 'dark'
                                ? '0 4px 16px rgba(0,0,0,0.3)'
                                : '0 4px 16px rgba(0,0,0,0.08)',
                        }}
                    >
                        <div className="flex items-center gap-3">
                            {/* Event Image */}
                            {event?.imageUrl && (
                                <img
                                    src={event.imageUrl}
                                    alt={eventTitle}
                                    className="w-14 h-14 rounded-lg object-cover"
                                />
                            )}

                            {/* Event Info */}
                            <div className="flex-1 min-w-0">
                                {/* Side indicator */}
                                {item.side && (
                                    <span
                                        className={`inline-block px-2 py-0.5 rounded text-xs font-bold mb-1 ${item.side === 'yes'
                                            ? 'bg-green-500/20 text-green-500'
                                            : 'bg-red-500/20 text-red-500'
                                            }`}
                                    >
                                        {item.side.toUpperCase()}
                                    </span>
                                )}
                                <p className="text-[var(--text-primary)] text-sm font-semibold truncate">{eventTitle}</p>
                                {item.type === 'POSITION_CLOSED' && item.finalPnL !== null && (
                                    <p className={`text-sm font-bold ${item.finalPnL >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        Realized: {item.finalPnL >= 0 ? '+' : ''}${item.finalPnL.toFixed(2)}
                                    </p>
                                )}
                            </div>

                            {/* Trade Button */}
                            <motion.button
                                onClick={handleTradeClick}
                                whileHover={{ scale: 1.05 }}
                                whileTap={{ scale: 0.95 }}
                                className="bg-yellow-300 px-4 py-2 text-black border-black border-2 font-extrabold text-sm rounded-lg"
                            >
                                Trade
                            </motion.button>
                        </div>
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
                    initialSide={item.side as 'yes' | 'no' || 'yes'}
                />
            )}
        </motion.div>
    );
}
