'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { fetchEvents, Event } from '../lib/api';

const formatVolume = (value?: number) => {
    if (!value || Number.isNaN(value)) return '$0';
    return `$${Intl.NumberFormat('en-US', {
        notation: 'compact',
        maximumFractionDigits: 1,
    }).format(value)}`;
};

const formatPercent = (value?: string | number) => {
    if (value === undefined || value === null) return '—';
    const numeric = typeof value === 'string' ? parseFloat(value) : value;
    if (Number.isNaN(numeric)) return '—';
    return `${Math.round(numeric * 100)}%`;
};

interface EventCardProps {
    event: Event;
    onClick: () => void;
}

function EventCard({ event, onClick }: EventCardProps) {
    // Get the hottest market (highest volume or yesBid)
    const hotMarket = (event.markets || [])
        .filter((m: any) =>
            m.status !== 'finalized' &&
            m.status !== 'resolved' &&
            m.status !== 'closed'
        )
        .sort((a: any, b: any) => {
            const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
            const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
            return bChance - aChance;
        })[0];

    const activeMarketsCount = (event.markets || []).filter((m: any) =>
        m.status !== 'finalized' &&
        m.status !== 'resolved' &&
        m.status !== 'closed'
    ).length;

    return (
     
     
     
        <div
            onClick={onClick}
            className="group relative flex-shrink-0 w-[280px] sm:w-[300px] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-hover)]/50 border border-[var(--border-color)] rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 hover:border-[var(--accent)]/30 card-hover-lift tail-flick-shadow"
        >
            {/* Event Image */}
         
         
         
            <div className="relative h-48 w-full overflow-hidden bg-gradient-to-br from-white/20 to-gray-400/20">
                {event.imageUrl ? (
                    <img
                        src={event.imageUrl}
                        alt={event.title || 'Event'}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <span className="text-5xl opacity-50">📊</span>
                    </div>
                )}
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-[var(--surface)] via-transparent to-transparent" />

                {/* Volume badge */}
               
                <div className="absolute top-3 right-3 px-2.5 py-1 bg-black/60 backdrop-blur-sm rounded-full">
                    <span className="text-xs font-semibold text-white">
                        {formatVolume(event.volume ?? event.volume24h ?? event.openInterest)}
                    </span>
                </div>
            </div>

            {/* Content */}

            <div className="p-4 space-y-3">
                {/* Title */}
                <h3 className="font-semibold text-[var(--text-primary)] text-[15px] leading-tight line-clamp-2 group-hover:text-[var(--accent)] transition-colors">
                    {event.title || 'Untitled Event'}
                </h3>

                {/* Markets count */}
                <div className="flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    <span>{activeMarketsCount} {activeMarketsCount === 1 ? 'market' : 'markets'}</span>
                </div>

                {/* Hot market preview */}
                {hotMarket && (
                    <div className="flex items-center justify-between px-3 py-2.5 bg-[var(--surface-hover)] rounded-xl border border-[var(--border-color)]">
                        <div className="flex items-center gap-2">
                            <span className="text-xs">🔥</span>
                            <span className="text-xs text-[var(--text-secondary)] font-medium truncate max-w-[120px]">
                                {hotMarket.yesSubTitle || hotMarket.title || 'Top Market'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-[var(--accent)]">
                                {formatPercent(hotMarket.yesBid)}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.5 bg-[var(--accent)]/20 text-[var(--accent)] rounded font-semibold">
                                YES
                            </span>
                        </div>
                    </div>
                )}

                {/* CTA */}
                <div className="flex items-center justify-between pt-1">
                    <span className="text-xs text-[var(--accent)] font-medium group-hover:text-[var(--accent-light)] transition-colors">
                        Hunt Markets →
                    </span>
                </div>
            </div>
        </div>
    );
}

export default function EventMarketplace() {
    const router = useRouter();
    const [events, setEvents] = useState<Event[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadEvents = async () => {
            try {
                setLoading(true);
                const response = await fetchEvents(10, {
                    status: 'active',
                    withNestedMarkets: true,
                });

                // Filter to only events with active markets and sort by volume
                const activeEvents = (response.events || [])
                    .filter((event) => {
                        if (event.markets && event.markets.length > 0) {
                            return event.markets.some(
                                (market: any) =>
                                    market.status === 'active'
                            );
                        }
                        return false;
                    })
                    .sort((a, b) => {
                        const aVol = a.volume ?? a.volume24h ?? a.openInterest ?? 0;
                        const bVol = b.volume ?? b.volume24h ?? b.openInterest ?? 0;
                        return bVol - aVol;
                    })
                    .slice(0, 8);

                setEvents(activeEvents);
            } catch (err) {
                console.error('Error loading events:', err);
            } finally {
                setLoading(false);
            }
        };

        loadEvents();
    }, []);

    const handleEventClick = (eventTicker: string) => {
        router.push(`/event/${encodeURIComponent(eventTicker)}`);
    };

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="flex items-center justify-between">
                    <div className="h-6 w-32 bg-[var(--surface)] rounded-lg animate-pulse" />
                </div>
                <div className="flex gap-4 overflow-hidden">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="flex-shrink-0 w-[280px] h-[280px] bg-[var(--surface)] rounded-2xl animate-pulse" />
                    ))}
                </div>
            </div>
        );
    }

    if (events.length === 0) {
        return null;
    }

    return (
        <div className="space-y-4 mx-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-white to-gray-400 flex items-center justify-center">
                        <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                        </svg>
                    </div>
                    <h2 className="text-lg font-bold text-[var(--text-primary)]">Stalking</h2>
                </div>
                <button
                    onClick={() => router.push('/home')}
                    className="text-xs text-[var(--accent)] hover:text-[var(--accent-light)] font-medium transition-colors"
                >
                    View All →
                </button>
            </div>

            {/* Horizontal Scrollable Events */}
            <div className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
                {events.map((event, index) => (
                    <EventCard
                        key={event.ticker || index}
                        event={event}
                        onClick={() => handleEventClick(event.ticker)}
                    />
                ))}
            </div>
        </div>
    );
}
