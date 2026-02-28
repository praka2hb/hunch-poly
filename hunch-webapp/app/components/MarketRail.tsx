'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchEvents, Event, Market } from '../lib/api';
import { useCatSafe } from '../contexts/CatContext';
import EventMotionGraph from './EventMotionGraph';
import OrderModal from './OrderModal';
import { EmblaCarouselType } from 'embla-carousel';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from './ui/carousel';

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

const formatTimeRemaining = (endDate?: string | number) => {
    if (!endDate) return null;

    let end: Date;
    if (typeof endDate === 'number') {
        // Assume seconds if small number (less than year 2286 in seconds)
        // 10000000000 is year 2286 in seconds
        if (endDate < 10000000000) {
            end = new Date(endDate * 1000);
        } else {
            end = new Date(endDate);
        }
    } else {
        end = new Date(endDate);
    }

    const now = new Date();
    const diff = end.getTime() - now.getTime();

    if (diff <= 0) return 'Closed';

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

    if (days > 7) return `${Math.floor(days / 7)}w left`;
    if (days > 0) return `${days}d left`;
    if (hours > 0) return `${hours}h left`;
    return 'Soon';
};

// Paw icon component
function PawIcon({ className = '' }: { className?: string }) {
    return (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className={className}>
            <ellipse cx="12" cy="16" rx="5" ry="4" />
            <circle cx="7" cy="9" r="2.5" />
            <circle cx="17" cy="9" r="2.5" />
            <circle cx="10" cy="6" r="2" />
            <circle cx="14" cy="6" r="2" />
        </svg>
    );
}

// Single market card for the rail
function MarketRailCard({
    event,
    isActive,
    onTrade,
}: {
    event: Event;
    isActive: boolean;
    onTrade: (market: Market) => void;
}) {
    const router = useRouter();
    const volume = formatVolume(event.volume ?? event.volume24h ?? event.openInterest);
    const timeLeft = formatTimeRemaining(event.closeTime);

    // Get top 2 markets sorted by yesBid (highest probability first)
    const top2Markets = (event.markets || [])
        .filter((m: Market) => m.status === 'active')
        .filter((m: Market) => {
            const yes = parseFloat(m.yesBid || '0');
            return yes < 0.95 && yes > 0.05; // Exclude near-certain outcomes
        })
        .sort((a: Market, b: Market) => {
            const aChance = parseFloat(a.yesBid || '0');
            const bChance = parseFloat(b.yesBid || '0');
            return bChance - aChance;
        })
        .slice(0, 2);

    const [hoverValues, setHoverValues] = useState<Record<string, number> | null>(null);

    const handleCardClick = (e: React.MouseEvent) => {
        // Prevent navigation if clicking on buttons
        if ((e.target as HTMLElement).closest('button')) return;
        router.push(`/event/${event.ticker}`);
    };

    // Get market subtitle/title for display
    const getMarketLabel = (market: Market): string => {
        // Use yesSubTitle first, then title, then fallback
        if (market.yesSubTitle && market.yesSubTitle !== 'Yes') {
            return market.yesSubTitle;
        }
        if (market.title) {
            // Truncate long titles
            return market.title.length > 25 ? market.title.slice(0, 22) + '...' : market.title;
        }
        return 'Market';
    };

    const formatDisplayPercent = (value?: number | string) => {
        if (value === undefined || value === null) return '—';
        const num = typeof value === 'string' ? parseFloat(value) : value;
        if (Number.isNaN(num)) return '—';
        // If the value looks like a percentage already (e.g., 23), show as-is
        if (Math.abs(num) > 1.5) return `${Math.round(num)}%`;
        // Otherwise treat as probability (0-1)
        return `${Math.round(num * 100)}%`;
    };

    return (
        <div className="w-full flex-shrink-0 px-1">
            <div
                onClick={handleCardClick}
                className={`
                relative overflow-hidden rounded-3xl border transition-all duration-500 cursor-pointer
                flex flex-col md:flex-row
                min-h-[280px] md:h-[320px]
                ${isActive
                        ? 'border-[var(--accent)]/40 shadow-[0_12px_50px_-15px_var(--glow-cyan)]'
                        : 'border-[var(--card-border)]'
                    }
                bg-gradient-to-br from-[var(--card-bg)] via-[var(--card-bg)] to-[var(--surface)]
            `}>
                {/* Content Section */}
                <div className="w-full md:w-[40%] flex flex-col p-4 relative md:border-r border-[var(--border-color)]/50 z-10">

                    {/* Header: Image and Title */}
                    <div className="flex items-start gap-3 mb-3">
                        {/* Image */}
                        <div className="relative w-14 h-14 md:w-16 md:h-16 flex-shrink-0 rounded-2xl overflow-hidden bg-[var(--surface)] ring-2 ring-[var(--border-color)]/40 shadow-lg">
                            {event.imageUrl ? (
                                <img
                                    src={event.imageUrl}
                                    alt={event.title}
                                    className="w-full h-full object-cover"
                                />
                            ) : (
                                <div className="w-full h-full bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-fuchsia)]/20 flex items-center justify-center">
                                    <PawIcon className="w-6 h-6 md:w-8 md:h-8 text-[var(--accent)] opacity-30" />
                                </div>
                            )}
                        </div>

                        {/* Title section */}
                        <div className="flex-1 min-w-0">
                            <h3 className="font-bold text-[var(--text-primary)] text-base md:text-2xl leading-tight tracking-tight break-words">
                                {event.title || 'Untitled Event'}
                            </h3>
                            {/* Event Subtitle - hide on mobile to save space */}
                            {event.subtitle && (
                                <p className="hidden md:block text-[11px] text-[var(--text-secondary)] mt-1 line-clamp-1">
                                    {event.subtitle}
                                </p>
                            )}
                        </div>
                    </div>

                    {/* Top markets summary under header (non-button rows) */}
                    {top2Markets.length > 0 && (
                        <div className="mb-2 space-y-1">
                            {top2Markets.map((m: Market, idx: number) => {
                                const hovered = hoverValues?.[m.ticker];
                                const percent = hovered !== undefined ? formatDisplayPercent(hovered) : formatPercent(m.yesBid);
                                const label = getMarketLabel(m);
                                // Match graph line colors: first yellow, second magenta
                                const accentColor = idx === 0 ? '#facc15' : '#d946ef';

                                return (
                                    <div
                                        key={m.ticker}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTrade(m);
                                        }}
                                        className="flex items-baseline justify-between pr-3 md:pr-5 text-sm md:text-base cursor-pointer transition-colors"
                                        style={{ color: accentColor }}
                                    >
                                        <span className="truncate font-medium">
                                            {label}
                                        </span>
                                        <span className="ml-2 font-semibold font-number text-base md:text-lg">
                                            {percent}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Time / outcomes badges under summary */}
                    <div className="flex flex-wrap items-center gap-2 mb-3">
                        {timeLeft && (
                            <div className="px-2 py-0.5 bg-[var(--surface)] rounded-lg border border-[var(--border-color)]">
                                <span className="text-[9px] font-semibold text-[var(--text-secondary)]">
                                    {timeLeft}
                                </span>
                            </div>
                        )}
                        {/* {(event.markets?.length || 0) > 1 && (
                            <div className="px-2 py-0.5 bg-[var(--surface)] rounded-lg border border-[var(--border-color)]">
                                <span className="text-[9px] font-semibold text-[var(--text-tertiary)]">
                                    {event.markets?.length} outcomes
                                </span>
                            </div>
                        )} */}
                    </div>

                    {/* Volume moved to bottom */}
                    <div className="mt-auto pt-1">
                        <div className="flex items-center justify-between text-[10px] md:text-xs">
                            <span className="uppercase tracking-wide text-white">
                                Volume
                            </span>
                            <div className="px-2 py-0.5 rounded-lg bg-[var(--surface)] ">
                                <span className="text-[17px] pr-50 font-semibold text-white">
                                    {volume}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Chart Section - Smaller on mobile */}
                <div className="w-full md:w-[60%] h-[120px] md:h-full bg-[var(--surface)]/5 relative">
                    <div className="absolute inset-0 bg-gradient-to-l from-[var(--card-bg)]/10 to-transparent pointer-events-none" />
                    <EventMotionGraph
                        eventTicker={event.ticker}
                        markets={top2Markets}
                        className="w-full h-full"
                        onHoverValues={(vals) => setHoverValues(vals)}
                    />
                </div>
            </div>
        </div>
    );
}

// Progress dots
function ProgressDots({
    total,
    current,
    onSelect
}: {
    total: number;
    current: number;
    onSelect: (index: number) => void;
}) {
    return (
        <div className="flex items-center justify-center gap-2 py-3">
            {Array.from({ length: total }).map((_, i) => (
                <button
                    key={i}
                    onClick={() => onSelect(i)}
                    className={`
            w-2 h-2 rounded-full transition-all duration-300
            ${i === current
                            ? 'bg-[var(--accent)] w-6'
                            : 'bg-[var(--surface-hover)] hover:bg-[var(--text-tertiary)]'
                        }
          `}
                />
            ))}
        </div>
    );
}

export default function MarketRail() {
    const [markets, setMarkets] = useState<Array<{ event: Event; market: Market }>>([]);
    const [currentIndex, setCurrentIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [tradeModalOpen, setTradeModalOpen] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
    const catContext = useCatSafe();
    const [emblaApi, setEmblaApi] = useState<EmblaCarouselType | null>(null);

    // Fetch unique events with their top market, sorted by volume and closing date
    useEffect(() => {
        const loadMarkets = async () => {
            try {
                setLoading(true);
                const response = await fetchEvents(30, {
                    status: 'active',
                    withNestedMarkets: true,
                });

                const now = new Date().getTime();

                // Process events and pick their top market
                const scoredEvents = (response.events || [])
                    .filter((event) => event.markets?.some((m: any) => m.status === 'active'))
                    .map((event) => {
                        const volume = event.volume ?? event.volume24h ?? event.openInterest ?? 0;

                        // Get active markets and find the top one (highest activity/yesBid)
                        // Exclude markets with 95%+ probability on either side
                        const activeMarkets = (event.markets || [])
                            .filter((m: any) => {
                                if (m.status !== 'active') return false;
                                const yes = parseFloat(m.yesBid || '0');
                                const no = parseFloat(m.noBid || '0');
                                return yes < 0.95 && no < 0.95;
                            });

                        // Pick the market with highest yesBid (most active/interesting)
                        const topMarket = activeMarkets
                            .sort((a: any, b: any) => {
                                const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
                                const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
                                return bChance - aChance;
                            })[0];

                        if (!topMarket) return null;

                        // Calculate close time for scoring
                        const closeTime = new Date(topMarket.closeTime || event.closeTime || Date.now() + 30 * 24 * 60 * 60 * 1000).getTime();
                        const daysToClose = Math.max(0, (closeTime - now) / (1000 * 60 * 60 * 24));

                        // Score: higher volume + closer to closing = higher priority
                        // Avoid events closing in < 1 day (too urgent) or > 60 days (too far)
                        const volumeScore = Math.log10(Math.max(volume, 1)) * 10;
                        const timeScore = daysToClose > 1 && daysToClose < 60
                            ? (60 - daysToClose) / 60 * 20
                            : 0;

                        return {
                            event,
                            market: topMarket as Market,
                            score: volumeScore + timeScore,
                        };
                    })
                    .filter((item): item is { event: Event; market: Market; score: number } => item !== null)
                    .sort((a, b) => b.score - a.score)
                    .slice(0, 7); // Limit to 7 unique events

                setMarkets(scoredEvents.map(({ event, market }) => ({ event, market })));
            } catch (err) {
                console.error('Error loading markets for rail:', err);
            } finally {
                setLoading(false);
            }
        };

        loadMarkets();
    }, []);

    // Sync carousel index with embla
    useEffect(() => {
        if (!emblaApi) return;
        const onSelect = () => {
            setCurrentIndex(emblaApi.selectedScrollSnap());
        };
        emblaApi.on('select', onSelect);
        onSelect();
        return () => {
            emblaApi.off('select', onSelect);
        };
    }, [emblaApi]);

    // Keep index in bounds when data changes
    useEffect(() => {
        if (currentIndex >= markets.length && markets.length > 0) {
            setCurrentIndex(markets.length - 1);
            emblaApi?.scrollTo(markets.length - 1);
        }
    }, [currentIndex, markets.length, emblaApi]);

    const handleDotSelect = useCallback((index: number) => {
        setCurrentIndex(index);
        emblaApi?.scrollTo(index);
    }, [emblaApi]);

    // Handle trade - now accepts a Market object
    const handleTrade = (market: Market) => {
        setSelectedMarket(market);
        setTradeModalOpen(true);
        if (catContext) {
            catContext.triggerPeekCat('Trust your instinct.');
        }
    };

    if (loading) {
        return (
            <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                    <div className="h-4 w-20 bg-[var(--surface)] rounded animate-pulse" />
                </div>
                <div className="h-[340px] bg-[var(--surface)] rounded-3xl animate-pulse" />
            </div>
        );
    }

    if (markets.length === 0) {
        return null;
    }

    const currentMarket = markets[currentIndex];

    return (
        <div className="mb-6">
            {/* Section header */}


            {/* Carousel rail (shadcn/embla) */}

            <Carousel
                opts={{ align: 'start', loop: markets.length > 1 }}
                setApi={setEmblaApi}
                className="relative px-6 md:px-10"
            >
                <CarouselContent className="pt-1">
                    {markets.map(({ event }, index) => (
                        <CarouselItem key={event.ticker || index} className="basis-full">
                            <MarketRailCard
                                event={event}
                                isActive={index === currentIndex}
                                onTrade={handleTrade}
                            />
                        </CarouselItem>
                    ))}
                </CarouselContent>
                {markets.length > 1 && (
                    <>
                        <CarouselPrevious className="hidden md:flex" />
                        <CarouselNext className="hidden md:flex" />
                    </>
                )}
            </Carousel>

            {/* Progress dots */}
            <ProgressDots
                total={markets.length}
                current={currentIndex}
                onSelect={handleDotSelect}
            />

            {/* Order Modal - CatGuide Pill Choice Flow */}
            {selectedMarket && currentMarket && (
                <OrderModal
                    isOpen={tradeModalOpen}
                    onClose={() => setTradeModalOpen(false)}
                    market={selectedMarket}
                    event={currentMarket.event}
                />
            )}
        </div>
    );
}
