'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { fetchEvents, Event, Market } from '../lib/api';
import { useCatSafe } from '../contexts/CatContext';

// Status badges for highlight cards
const STATUS_LABELS = ['Stirring', 'Watched', 'Quiet'] as const;
type StatusLabel = typeof STATUS_LABELS[number];

// Determine status based on volume/activity
const getStatus = (event: Event): StatusLabel => {
    const volume = event.volume ?? event.volume24h ?? event.openInterest ?? 0;
    if (volume > 100000) return 'Stirring';
    if (volume > 10000) return 'Watched';
    return 'Quiet';
};

// Format helpers
const formatPercent = (value?: string | number) => {
    if (value === undefined || value === null) return '—';
    const numeric = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(numeric)) return '—';
    return `${Math.round(numeric * 100)}%`;
};

const formatVolume = (value?: number) => {
    if (!value || Number.isNaN(value)) return '$0';
    return `$${Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value)}`;
};

// Mock social signal - in production this would come from API
const getSocialSignal = (event: Event): string => {
    const earlyCount = Math.floor(Math.random() * 30) + 5;
    return `${earlyCount} entered early`;
};

// Paw icon component
function PawIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
        >
            <ellipse cx="12" cy="16" rx="5" ry="4" />
            <circle cx="7" cy="9" r="2.5" />
            <circle cx="17" cy="9" r="2.5" />
            <circle cx="10" cy="6" r="2" />
            <circle cx="14" cy="6" r="2" />
        </svg>
    );
}

// Individual highlight card
function HighlightCard({
    event,
    representativeMarket,
    onSelect,
    isFirst,
}: {
    event: Event;
    representativeMarket: Market;
    onSelect: () => void;
    isFirst: boolean;
}) {
    const [hasInteracted, setHasInteracted] = useState(false);
    const [showPeek, setShowPeek] = useState(false);
    const catContext = useCatSafe();

    const status = getStatus(event);
    const socialSignal = getSocialSignal(event);

    const activeMarketsCount = (event.markets || []).filter((m: any) =>
        m.status === 'active'
    ).length;

    const yesPercent = formatPercent(representativeMarket.yesAsk ?? representativeMarket.yesBid);
    const noPercent = formatPercent(representativeMarket.noAsk ?? representativeMarket.noBid);

    // First interaction peek on session (only once)
    useEffect(() => {
        if (isFirst && !hasInteracted) {
            const hasSeenPeek = sessionStorage.getItem('highlight-peek-shown');
            if (!hasSeenPeek) {
                const timer = setTimeout(() => {
                    setShowPeek(true);
                    sessionStorage.setItem('highlight-peek-shown', 'true');
                    setTimeout(() => setShowPeek(false), 1200);
                }, 2000);
                return () => clearTimeout(timer);
            }
        }
    }, [isFirst, hasInteracted]);

    const handleClick = () => {
        setHasInteracted(true);
        if (catContext) {
            catContext.triggerPeekCat('You noticed.');
        }
        onSelect();
    };

    return (
        <motion.div
            onClick={handleClick}
            className="group relative flex-shrink-0 w-[320px] sm:w-[360px] bg-gradient-to-b from-[var(--card-bg)] to-[var(--surface)] border border-[var(--card-border)] rounded-2xl overflow-hidden cursor-pointer transition-all duration-500 tail-flick-shadow"
            whileHover={{
                y: -4,
                boxShadow: '0 16px 48px -12px var(--glow-cyan), 0 4px 16px -4px rgba(0, 0, 0, 0.5)'
            }}
            transition={{ type: 'tween', duration: 0.3, ease: 'easeOut' }}
        >
            {/* First interaction peek (cat eyes/ears) */}
            <AnimatePresence>
                {showPeek && (
                    <motion.div
                        className="absolute top-2 right-2 z-10"
                        initial={{ opacity: 0, y: 10, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -5, scale: 0.9 }}
                        transition={{ duration: 0.4, ease: 'easeOut' }}
                    >
                        <div className="flex flex-col items-center gap-1">
                            <svg width="24" height="16" viewBox="0 0 48 32" fill="none" className="text-[var(--accent)] opacity-60">
                                <path d="M8 16 L4 4 L14 10 Z" fill="currentColor" />
                                <path d="M40 16 L44 4 L34 10 Z" fill="currentColor" />
                                <ellipse cx="16" cy="18" rx="3" ry="4" fill="currentColor" />
                                <ellipse cx="32" cy="18" rx="3" ry="4" fill="currentColor" />
                            </svg>
                            <span className="text-[9px] text-[var(--text-tertiary)] font-medium">Something moved.</span>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Card content */}
            <div className="p-5 space-y-4">
                {/* Event Title + Status */}
                <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                            <PawIcon className="text-[var(--accent)] opacity-50 flex-shrink-0" />
                            <h3 className="font-semibold text-[var(--text-primary)] text-base leading-snug line-clamp-2 group-hover:text-[var(--accent)] transition-colors duration-300">
                                {event.title || 'Untitled Event'}
                            </h3>
                        </div>
                        <p className="text-xs text-[var(--text-tertiary)]">
                            {activeMarketsCount} {activeMarketsCount === 1 ? 'market' : 'markets'} active
                        </p>
                    </div>

                    {/* Status badge */}
                    <span className={`
            flex-shrink-0 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase tracking-wide
            ${status === 'Stirring'
                            ? 'bg-[var(--accent)]/10 text-[var(--accent)]'
                            : status === 'Watched'
                                ? 'bg-[var(--accent-fuchsia)]/10 text-[var(--accent-fuchsia)]'
                                : 'bg-[var(--surface-hover)] text-[var(--text-tertiary)]'
                        }
          `}>
                        {status}
                    </span>
                </div>

                {/* Representative market preview */}
                <div className="px-3 py-3 bg-[var(--surface-hover)]/50 rounded-xl border border-[var(--border-color)]">
                    <p className="text-sm text-[var(--text-secondary)] line-clamp-2 mb-3">
                        {representativeMarket.yesSubTitle || representativeMarket.title || 'Market question'}
                    </p>

                    {/* Probabilities */}
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-tertiary)] uppercase">Yes</span>
                            <span className="text-sm font-semibold text-[var(--accent)] font-number">{yesPercent}</span>
                        </div>
                        <div className="h-4 w-px bg-[var(--border-color)]" />
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-[var(--text-tertiary)] uppercase">No</span>
                            <span className="text-sm font-semibold text-[var(--accent-fuchsia)] font-number">{noPercent}</span>
                        </div>
                    </div>
                </div>

                {/* Social signal */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <PawIcon className="opacity-40" />
                    <span>{socialSignal}</span>
                </div>
            </div>
        </motion.div>
    );
}

export default function HighlightGallery({
    onEventSelect,
}: {
    onEventSelect?: (eventTicker: string) => void;
}) {
    const router = useRouter();
    const [highlights, setHighlights] = useState<Array<{ event: Event; market: Market }>>([]);
    const [loading, setLoading] = useState(true);
    const scrollRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadHighlights = async () => {
            try {
                setLoading(true);
                const response = await fetchEvents(20, {
                    status: 'active',
                    withNestedMarkets: true,
                });

                // Filter and rank events by volume
                const rankedEvents = (response.events || [])
                    .filter((event) => {
                        if (!event.markets || event.markets.length === 0) return false;
                        return event.markets.some((m: any) => m.status === 'active');
                    })
                    .map((event) => {
                        const totalVolume = event.volume ?? event.volume24h ?? event.openInterest ?? 0;

                        // Get representative market (highest activity)
                        const representativeMarket = (event.markets || [])
                            .filter((m: any) => m.status === 'active')
                            .sort((a: any, b: any) => {
                                const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
                                const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
                                return bChance - aChance;
                            })[0];

                        return { event, market: representativeMarket, volume: totalVolume };
                    })
                    .filter((item) => item.market) // Must have a representative market
                    .sort((a, b) => b.volume - a.volume)
                    .slice(0, 7); // Limit to 7 highlights

                setHighlights(rankedEvents.map(({ event, market }) => ({ event, market })));
            } catch (err) {
                console.error('Error loading highlights:', err);
            } finally {
                setLoading(false);
            }
        };

        loadHighlights();
    }, []);

    const handleEventSelect = (eventTicker: string) => {
        if (onEventSelect) {
            onEventSelect(eventTicker);
        } else {
            // Default: navigate to event page
            router.push(`/event/${encodeURIComponent(eventTicker)}`);
        }
    };

    if (loading) {
        return (
            <div className="mb-8">
                <div className="flex items-center gap-2 mb-4">
                    <div className="h-4 w-24 bg-[var(--surface)] rounded animate-pulse" />
                </div>
                <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3].map((i) => (
                        <div key={i} className="flex-shrink-0 w-[320px] h-[200px] bg-[var(--surface)] rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (highlights.length === 0) {
        return null;
    }

    return (
        <div className="mb-8">
            {/* Section header - subtle */}
            <div className="flex items-center gap-2 mb-4">
                <PawIcon className="text-[var(--text-tertiary)] opacity-50" />
                <h2 className="text-sm font-medium text-[var(--text-tertiary)] tracking-wide">
                    Worth Watching
                </h2>
            </div>

            {/* Horizontal scrolling gallery */}
            <div
                ref={scrollRef}
                className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                style={{ scrollBehavior: 'smooth' }}
            >
                {highlights.map(({ event, market }, index) => (
                    <HighlightCard
                        key={event.ticker || index}
                        event={event}
                        representativeMarket={market}
                        onSelect={() => handleEventSelect(event.ticker)}
                        isFirst={index === 0}
                    />
                ))}
            </div>
        </div>
    );
}
