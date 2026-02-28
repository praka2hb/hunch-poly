'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import {
  fetchHomeFeed,
  fetchTagsByCategories,
  fetchTopEventsByCategory,
  Event,
  TagsByCategories,
  Market,
} from '../lib/api';
import { isEventActive } from '../lib/eventUtils';
import OrderModal from '../components/OrderModal';
import EventCardWithNews from '../components/EventCardWithNews';

const DEFAULT_CATEGORIES = [
  'Climate and Weather',
  'Companies',
  'Crypto',
  'Economics',
  'Elections',
  'Entertainment',
  'Financials',
  'Mentions',
  'Politics',
  'Science and Technology',
  'Social',
  'Sports',
  'Transportation',
];

const EVENTS_PER_PAGE = 20;

// Format helpers for the card UI
const formatPercent = (value?: string | number) => {
  if (value === undefined || value === null) return '—';
  const numeric = typeof value === 'string' ? parseFloat(value) : value;
  if (Number.isNaN(numeric)) return '—';
  return `${Math.round(numeric * 100)}%`;
};

const formatVolume = (value?: number) => {
  if (!value || Number.isNaN(value)) return '$—';
  return `$${Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)}`;
};

const CATEGORY_COLORS: Record<string, string> = {
  crypto: 'from-orange-500/20 to-orange-600/20',
  politics: 'from-blue-500/20 to-blue-600/20',
  sports: 'from-green-500/20 to-green-600/20',
  entertainment: 'from-pink-500/20 to-pink-600/20',
  tech: 'from-indigo-500/20 to-indigo-600/20',
  finance: 'from-teal-500/20 to-teal-600/20',
  'climate and weather': 'from-cyan-500/20 to-cyan-600/20',
  companies: 'from-purple-500/20 to-purple-600/20',
  economics: 'from-amber-500/20 to-amber-600/20',
  elections: 'from-red-500/20 to-red-600/20',
  financials: 'from-emerald-500/20 to-emerald-600/20',
  mentions: 'from-rose-500/20 to-rose-600/20',
  'science and technology': 'from-violet-500/20 to-violet-600/20',
  social: 'from-fuchsia-500/20 to-fuchsia-600/20',
  transportation: 'from-lime-500/20 to-lime-600/20',
};

// Event Card Component with layout matching the provided design
function EventCard({
  event,
  onClick,
  onOpenTrade,
  isMobile,
  showCategory,
  category,
  className = '',
}: {
  event: Event;
  onClick: () => void;
  onOpenTrade: (market: Market, side: 'yes' | 'no', event: Event) => void;
  isMobile: boolean;
  showCategory?: boolean;
  category?: string;
  className?: string;
}) {
  const [expandedMarket, setExpandedMarket] = useState<string | null>(null);

  // Filter active markets and sort by chance (yesBid) descending, then take top 2
  const hotMarkets = (event.markets || [])
    .filter((m: any) =>
      m.status !== 'finalized' &&
      m.status !== 'resolved' &&
      m.status !== 'closed'
    )
    .sort((a: any, b: any) => {
      const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
      const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
      return bChance - aChance; // Descending order - highest chance first
    })
    .slice(0, 2);

  // Calculate potential return for a $100 investment
  const calculateReturn = (price: string | undefined, investment: number = 100): number | null => {
    if (!price) return null;
    const priceNum = parseFloat(price);
    if (priceNum <= 0 || Number.isNaN(priceNum)) return null;
    return investment / priceNum;
  };

  const handleMarketButtonClick = (
    e: React.MouseEvent,
    market: any,
    side: 'yes' | 'no',
    key: string
  ) => {
    e.stopPropagation(); // Prevent card click

    // On mobile: skip in-card popup and open bottom drawer directly
    if (isMobile) {
      onOpenTrade(market as Market, side, event);
      return;
    }

    // On larger screens: toggle in-card popup
    setExpandedMarket(expandedMarket === key ? null : key);
  };

  const categoryColor = category ? CATEGORY_COLORS[category.toLowerCase()] || 'from-gray-500/20 to-gray-600/20' : '';

  return (
    <div
      id={`event-${event.ticker}`}
      onClick={onClick}
      className={`group relative flex flex-col gap-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-4 cursor-pointer transition-all duration-300 card-hover-lift tail-flick-shadow ${className}`}
    >
      {/* Category Badge */}
      {showCategory && category && (
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${categoryColor} border border-[var(--card-border)] w-fit`}>
          <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
            {category}
          </span>
        </div>
      )}

      {/* Header (image + title) – always visible */}
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-2xl overflow-hidden bg-gradient-to-br from-[var(--accent)]/20 to-[var(--accent-light)]/20 flex-shrink-0">
          {event.imageUrl ? (
            <img
              src={event.imageUrl}
              alt={event.title}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-xl">
              📊
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-[var(--text-primary)] leading-snug text-xl sm:text-xl group-hover:text-[var(--accent)] transition-colors line-clamp-2">
            {event.title || 'Untitled Event'}
          </h3>
        </div>
      </div>

      {/* Markets + footer – fade when a market is expanded */}
      <div
        className={
          expandedMarket ?
            'opacity-0 pointer-events-none transition-opacity duration-200' :
            'opacity-100 transition-opacity duration-200'
        }
      >
        {/* Hot Markets */}
        {hotMarkets.length > 0 && (
          <div className="space-y-2">
            {hotMarkets.map((market: any) => {
              const yesChance = market.yesBid ? parseFloat(market.yesBid) : 0;
              const noChance = 1 - yesChance;
              const yesReturn = calculateReturn(market.yesBid);
              const noReturn = calculateReturn(market.noBid);
              const key = `${event.ticker}-${market.ticker}`;

              return (
                <div
                  key={market.ticker}
                  className="bg-[var(--surface)] rounded-2xl p-3 space-y-2"
                >
                  <p className="text-sm text-[var(--text-secondary)] line-clamp-2">
                    {market.question}
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleMarketButtonClick(e, market, 'yes', key)}
                      className="flex-1 bg-gradient-to-r from-green-500/20 to-green-600/20 hover:from-green-500/30 hover:to-green-600/30 border border-green-500/30 rounded-xl px-3 py-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">Yes</span>
                        <span className="text-sm font-bold text-green-400">
                          {formatPercent(yesChance)}
                        </span>
                      </div>
                      {yesReturn && (
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          ${yesReturn.toFixed(0)} return
                        </div>
                      )}
                    </button>
                    <button
                      onClick={(e) => handleMarketButtonClick(e, market, 'no', key)}
                      className="flex-1 bg-gradient-to-r from-red-500/20 to-red-600/20 hover:from-red-500/30 hover:to-red-600/30 border border-red-500/30 rounded-xl px-3 py-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--text-tertiary)]">No</span>
                        <span className="text-sm font-bold text-red-400">
                          {formatPercent(noChance)}
                        </span>
                      </div>
                      {noReturn && (
                        <div className="text-xs text-[var(--text-tertiary)] mt-0.5">
                          ${noReturn.toFixed(0)} return
                        </div>
                      )}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer with volume and markets count */}
        <div className="flex items-center justify-between pt-2 mt-2 border-t border-[var(--card-border)]">
          <div className="flex flex-col">
            <span className="text-xs text-[var(--text-tertiary)]">Volume</span>
            <span className="text-sm font-bold text-[var(--text-primary)]">
              {formatVolume(event.volume)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-xs text-[var(--text-tertiary)]">Markets</span>
            <div className="text-sm font-medium text-[var(--accent)]">
              {event.markets?.length || 0}
            </div>
          </div>
        </div>
      </div>

      {/* Expanded Market Popup (desktop only) */}
      <AnimatePresence>
        {expandedMarket && !isMobile && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute inset-0 bg-[var(--card-bg)] border-2 border-[var(--accent)] rounded-3xl p-4 z-10 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const market = hotMarkets.find((m: any) => `${event.ticker}-${m.ticker}` === expandedMarket);
              if (!market) return null;

              return (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedMarket(null);
                    }}
                    className="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-full bg-[var(--surface)] hover:bg-[var(--card-border)] transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>

                  <div className="flex-1 flex flex-col justify-center gap-4">
                    <div>
                      <h4 className="text-sm font-semibold text-[var(--text-primary)] mb-1 line-clamp-2">
                        {market.question}
                      </h4>
                      <p className="text-xs text-[var(--text-tertiary)]">
                        {event.title}
                      </p>
                    </div>

                    <div className="flex gap-3">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTrade(market as Market, 'yes', event);
                          setExpandedMarket(null);
                        }}
                        className="flex-1 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 rounded-xl px-4 py-3 transition-all"
                      >
                        <div className="text-white font-semibold">Yes</div>
                        <div className="text-white/80 text-sm">
                          {formatPercent(market.yesBid)}
                        </div>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTrade(market as Market, 'no', event);
                          setExpandedMarket(null);
                        }}
                        className="flex-1 bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 rounded-xl px-4 py-3 transition-all"
                      >
                        <div className="text-white font-semibold">No</div>
                        <div className="text-white/80 text-sm">
                          {formatPercent(market.noBid ? 1 - parseFloat(market.noBid) : 0)}
                        </div>
                      </button>
                    </div>
                  </div>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


export default function HomePage() {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const [apiCategories, setApiCategories] = useState<TagsByCategories>({});
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const observerTarget = useRef<HTMLDivElement>(null);
  const [tradeModalMarket, setTradeModalMarket] = useState<Market | null>(null);
  const [tradeModalSide, setTradeModalSide] = useState<'yes' | 'no'>('yes');
  const [tradeModalEvent, setTradeModalEvent] = useState<Event | null>(null);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport to control popup vs bottom drawer behaviour
  useEffect(() => {
    const updateIsMobile = () => {
      if (typeof window !== 'undefined') {
        setIsMobile(window.innerWidth < 640); // Tailwind 'sm' breakpoint
      }
    };

    updateIsMobile();
    window.addEventListener('resize', updateIsMobile);
    return () => window.removeEventListener('resize', updateIsMobile);
  }, []);

  // Focus mobile search input when opening
  useEffect(() => {
    if (isMobileSearchOpen && mobileSearchInputRef.current) {
      mobileSearchInputRef.current.focus();
    }
  }, [isMobileSearchOpen]);

  useEffect(() => {
    const loadCategories = async () => {
      try {
        const categories = await fetchTagsByCategories();
        setApiCategories(categories);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };
    loadCategories();
  }, []);

  const availableCategories = Object.keys(apiCategories).length > 0
    ? Object.keys(apiCategories)
    : DEFAULT_CATEGORIES;

  const categoryFilters = ['All', ...availableCategories];

  const loadCategoryEvents = async (category: string) => {
    try {
      setLoading(true);
      setError(null);
      setHasMore(false);
      setCursor(undefined);

      // Use the new single endpoint for category filtering
      const data = await fetchHomeFeed(EVENTS_PER_PAGE, {
        category,
        status: 'active',
      });

      const activeEvents = (data.events || []).filter(isEventActive);
      setEvents(activeEvents);
    } catch (err: any) {
      setError(err.message || 'Failed to load category events');
      console.error('Error loading category events:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Initial load and category changes
  useEffect(() => {
    if (selectedCategory === 'All') {
      loadEvents(true);
    } else {
      loadCategoryEvents(selectedCategory);
    }
  }, [selectedCategory]);

  const loadEvents = async (reset = false) => {
    try {
      if (selectedCategory !== 'All') {
        return;
      }

      if (reset) {
        setLoading(true);
        setError(null);
      } else {
        setLoadingMore(true);
      }

      const data = await fetchHomeFeed(EVENTS_PER_PAGE, {
        cursor: reset ? undefined : cursor,
        category: 'All', // Explicitly pass 'All' or leave undefined
        status: 'active',
      });

      const nextEvents = (data.events || []).filter(isEventActive);

      if (reset) {
        setEvents(nextEvents);
      } else {
        setEvents((prev) => [...prev, ...nextEvents]);
      }

      setCursor(data.cursor);
      setHasMore(!!data.cursor);
    } catch (err: any) {
      setError(err.message || 'Failed to load events');
      console.error('Error loading events:', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  // Infinite scroll observer
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && selectedCategory === 'All') {
          loadEvents(false);
        }
      },
      { threshold: 0.1 }
    );

    if (observerTarget.current) {
      observer.observe(observerTarget.current);
    }

    return () => observer.disconnect();
  }, [hasMore, loadingMore, cursor, selectedCategory]);

  // Filter events based on search query
  useEffect(() => {
    let filtered = events;

    // Apply search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((event) => {
        const searchText = `${event.title} ${event.subtitle || ''} ${event.description || ''}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    // Sort by volume (highest first)
    filtered = filtered.sort((a, b) => (b.volume || 0) - (a.volume || 0));

    setFilteredEvents(filtered);
  }, [events, searchQuery]);

  const handleEventClick = (eventTicker: string) => {
    router.push(`/event/${encodeURIComponent(eventTicker)}`);
  };

  const handleOpenTradeModal = (market: Market, side: 'yes' | 'no', event: Event) => {
    setTradeModalMarket(market);
    setTradeModalSide(side);
    setTradeModalEvent(event);
  };

  const handleCloseTradeModal = () => {
    setTradeModalMarket(null);
    setTradeModalEvent(null);
  };

  const topEvents = filteredEvents.slice(0, 3);
  const remainingEvents = filteredEvents.slice(3);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
              Explore Events
            </h1>
            <p className="text-[var(--text-secondary)]">
              Loading prediction markets...
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-64 bg-[var(--surface)] rounded-3xl animate-pulse" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 mb-4 rounded-full bg-red-500/10 flex items-center justify-center">
              <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <p className="text-[var(--text-secondary)] text-lg mb-4">{error}</p>
            <button
              onClick={() => loadEvents(true)}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            Explore Events
          </h1>
          <p className="text-[var(--text-secondary)]">
            Discover and trade on prediction markets
          </p>
        </div>

        {/* Desktop: Search + Category Filters in one row */}
        <div className="hidden sm:flex items-center gap-3 mb-6">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <input
              type="text"
              placeholder="Search events..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2.5 pl-10 bg-[var(--surface)] border border-[var(--card-border)] rounded-2xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
            />
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* Category Pills */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide">
            {categoryFilters.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === category
                  ? 'bg-[var(--accent)] text-white shadow-lg'
                  : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--card-border)]'
                  }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Mobile: Search Icon + Category Pills */}
        <div className="sm:hidden mb-6 space-y-3">
          {/* Search Toggle + Category Pills Row */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsMobileSearchOpen(!isMobileSearchOpen)}
              className={`flex-shrink-0 w-10 h-10 flex items-center justify-center rounded-full transition-colors ${isMobileSearchOpen
                ? 'bg-[var(--accent)] text-white'
                : 'bg-[var(--surface)] text-[var(--text-tertiary)]'
                }`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>

            <div className="flex gap-2 overflow-x-auto scrollbar-hide flex-1">
              {categoryFilters.map((category) => (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-all ${selectedCategory === category
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--surface)] text-[var(--text-secondary)]'
                    }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile Search Input (expandable) */}
          {isMobileSearchOpen && (
            <div className="relative">
              <input
                ref={mobileSearchInputRef}
                type="text"
                placeholder="Search events..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2.5 pl-10 bg-[var(--surface)] border border-[var(--card-border)] rounded-2xl text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] transition-colors"
              />
              <svg
                className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-[var(--text-tertiary)]"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
          )}
        </div>

        {filteredEvents.length > 0 && (
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">
              Top events by volume
            </h2>
            {selectedCategory !== 'All' && (
              <span className="text-sm text-[var(--text-secondary)]">
                {selectedCategory}
              </span>
            )}
          </div>
        )}

        {/* Events Grid - 1 col mobile, 2 cols tablet, 3 cols desktop */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredEvents.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 mb-4 rounded-full bg-[var(--surface)] flex items-center justify-center">
                <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <p className="text-[var(--text-secondary)] text-sm mb-3">
                {searchQuery ? `No markets found for "${searchQuery}"` : 'No events found'}
              </p>
              {(selectedCategory !== 'All' || searchQuery) && (
                <button
                  onClick={() => {
                    setSelectedCategory('All');
                    setSearchQuery('');
                  }}
                  className="text-[var(--accent)] text-sm font-medium hover:underline"
                >
                  Clear filters →
                </button>
              )}
            </div>
          ) : (
            topEvents.map((event, index) => (
              <EventCardWithNews key={`top-${event.ticker || index}`} eventTicker={event.ticker}>
                <EventCard
                  event={event}
                  onClick={() => handleEventClick(event.ticker)}
                  onOpenTrade={handleOpenTradeModal}
                  isMobile={isMobile}
                  showCategory={selectedCategory === 'All'}
                  category={(event as any).category}
                  className="rounded-t-none border-t-0"
                />
              </EventCardWithNews>
            ))
          )}
        </div>

        {remainingEvents.length > 0 && (
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {remainingEvents.map((event, index) => (
              <EventCardWithNews key={`rest-${event.ticker || index}`} eventTicker={event.ticker}>
                <EventCard
                  event={event}
                  onClick={() => handleEventClick(event.ticker)}
                  onOpenTrade={handleOpenTradeModal}
                  isMobile={isMobile}
                  showCategory={selectedCategory === 'All'}
                  category={(event as any).category}
                  className="rounded-t-none border-t-0"
                />
              </EventCardWithNews>
            ))}
          </div>
        )}

        {/* Infinite scroll trigger */}
        {hasMore && (
          <div ref={observerTarget} className="flex justify-center py-6">
            {loadingMore && (
              <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
            )}
          </div>
        )}

        {/* End indicator */}
        {!hasMore && events.length > 0 && (
          <div className="text-center py-6 text-[var(--text-tertiary)] text-sm">
            You've reached the end
          </div>
        )}
      </main>

      {/* Trade Modal */}
      {tradeModalMarket && tradeModalEvent && (
        <OrderModal
          isOpen={true}
          onClose={handleCloseTradeModal}
          market={tradeModalMarket}
          event={tradeModalEvent}
        />
      )}
    </div>
  );
}
