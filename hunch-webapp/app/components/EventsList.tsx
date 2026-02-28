'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { fetchEvents, fetchTagsByCategories, Event, TagsByCategories, Market } from '../lib/api';
import OrderModal from './OrderModal';
// ===== DEMO DATA IMPORT - REMOVE WHEN API IS BACK =====
import { USE_DEMO_DATA, DEMO_EVENTS } from '../lib/demoData';
// ======================================================

// Topic filters with gradient colors
const TOPIC_FILTERS = [
  { id: 'all', label: 'All', keywords: [], color: 'yellow' },
  { id: 'crypto', label: 'Crypto', keywords: ['crypto', 'bitcoin', 'btc', 'eth', 'ethereum', 'solana', 'sol', 'token', 'defi', 'nft', 'blockchain', 'web3', 'memecoin', 'altcoin', 'stablecoin', 'usdc', 'usdt'], color: 'orange' },
  { id: 'politics', label: 'Politics', keywords: ['election', 'president', 'congress', 'senate', 'vote', 'government', 'trump', 'biden', 'democrat', 'republican', 'political', 'governor', 'mayor', 'impeach', 'cabinet', 'white house', 'electoral'], color: 'blue' },
  { id: 'sports', label: 'Sports', keywords: ['football', 'basketball', 'soccer', 'nfl', 'nba', 'mlb', 'nhl', 'tennis', 'golf', 'ufc', 'mma', 'boxing', 'f1', 'formula 1', 'racing', 'olympics', 'world cup', 'championship', 'playoff', 'super bowl', 'world series', 'finals', 'mvp', 'team', 'player'], color: 'green' },
  { id: 'entertainment', label: 'Fun', keywords: ['movie', 'film', 'music', 'celebrity', 'awards', 'oscar', 'grammy', 'emmy', 'tv show', 'streaming', 'netflix', 'disney', 'spotify', 'concert', 'album', 'box office', 'actor', 'actress', 'singer', 'rapper'], color: 'pink' },
  { id: 'tech', label: 'Tech', keywords: ['ai ', ' ai', 'artificial intelligence', 'openai', 'chatgpt', 'gpt-', 'llm', 'machine learning', 'robotics', 'autonomous', 'iphone', 'android', 'software', 'app launch', 'product launch', 'tech company', 'silicon valley', 'semiconductor', 'chip', 'nvidia'], color: 'indigo' },
  { id: 'finance', label: 'Finance', keywords: ['stock', 'fed ', 'federal reserve', 'interest rate', 'inflation', 'gdp', 'recession', 'economy', 'wall street', 's&p 500', 'nasdaq', 'dow jones', 'treasury', 'bond', 'yield', 'earnings', 'quarterly'], color: 'teal' },
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

// Event Card Component with layout matching the provided design
function EventCard({
  event,
  onClick,
  onOpenTrade,
  isMobile,
}: {
  event: Event;
  onClick: () => void;
  onOpenTrade: (market: Market, side: 'yes' | 'no', event: Event) => void;
  isMobile: boolean;
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

  return (
    <div
      id={`event-${event.ticker}`}
      onClick={onClick}
      className="group relative flex flex-col gap-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-4 cursor-pointer transition-all duration-300 card-hover-lift tail-flick-shadow"
    >
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
          expandedMarket ? 'opacity-0 pointer-events-none' : 'opacity-100'
        }
      >
        {hotMarkets.length > 0 && (
          <div className="space-y-3 mt-3">
            {hotMarkets.map((market: any, idx: number) => {
              const label =
                market.yesSubTitle ||
                market.noSubTitle ||
                market.subtitle ||
                market.title ||
                `Option ${idx + 1}`;
              const yesPercent = formatPercent(market.yesAsk ?? market.yesBid);
              const key = market.ticker || idx.toString();
              const yesPrice = market.yesAsk
                ? parseFloat(market.yesAsk)
                : market.yesBid
                  ? parseFloat(market.yesBid)
                  : null;

              return (
                <div
                  key={key}
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenTrade(market as Market, 'yes', event);
                  }}
                  className="flex items-center justify-between gap-3 px-3 py-2 rounded-2xl bg-[var(--surface)] cursor-pointer"
                >
                  <span className="text-xl text-[var(--text-primary)] truncate">
                    {label}
                  </span>
                  <div
                    className={`flex items-center gap-2 flex-shrink-0 ${isMobile ? 'cursor-pointer' : ''}`}
                    onClick={
                      isMobile
                        ? (e) => {
                          e.stopPropagation();
                          onOpenTrade(market as Market, 'yes', event);
                        }
                        : undefined
                    }
                  >
                    <span className="text-xl font-semibold text-[var(--text-primary)] font-number">
                      {yesPercent}
                    </span>
                    {yesPrice !== null && yesPrice < 1 && (
                      <svg
                        className="w-3 h-3 text-[var(--text-tertiary)]"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                    {!isMobile && (
                      <>
                        <button
                          onClick={(e) => handleMarketButtonClick(e, market, 'yes', key)}
                          className="font-semibold px-3 py-1.5 text-sm rounded-full bg-gradient-to-r from-[#facc15] to-[#fbbf24] text-[#0D0D0F] hover:shadow-[0_0_16px_var(--glow-cyan)] transition-all"
                        >
                          Yes
                        </button>
                        <button
                          onClick={(e) => handleMarketButtonClick(e, market, 'no', key)}
                          className="font-semibold px-3 py-1.5 text-sm rounded-full bg-gradient-to-r from-[#E879F9] to-[#F0ABFC] text-[#0D0D0F] hover:shadow-[0_0_16px_var(--glow-magenta)] transition-all"
                        >
                          No
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {hotMarkets.length === 0 && event.subtitle && (
          <div className="px-3 py-2 mt-3 rounded-2xl bg-[var(--surface-hover)] text-sm text-[var(--text-secondary)]">
            {event.subtitle}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-xs text-[var(--text-tertiary)] pt-1">
          <span className="font-number">
            {formatVolume(
              event.volume ?? event.volume24h ?? event.openInterest
            )}
          </span>
          {event.subtitle && (
            <p className="text-[12px] text-[var(--text-tertiary)] text-right line-clamp-2 max-w-[65%] px-2 py-1">
              {event.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Full-card overlay when a market is expanded */}
      {expandedMarket && hotMarkets.length > 0 && (
        (() => {
          const idx = hotMarkets.findIndex(
            (m: any, i: number) =>
              m.ticker === expandedMarket || i.toString() === expandedMarket
          );
          if (idx === -1) return null;
          const market = hotMarkets[idx];

          const label =
            market.yesSubTitle ||
            market.noSubTitle ||
            market.subtitle ||
            market.title ||
            `Option ${idx + 1}`;

          const yesPercent = formatPercent(market.yesAsk ?? market.yesBid);
          const noPercent = formatPercent(market.noAsk ?? market.noBid);

          const yesReturn = calculateReturn(market.yesAsk, 100);
          const noReturn = calculateReturn(market.noAsk, 100);

          return (
            <div
              className="absolute left-0 right-0 bottom-0 top-16 rounded-b-3xl  backdrop-blur-sm flex items-center justify-center animate-fadeIn"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Top-right back button */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setExpandedMarket(null);
                }}
                className="absolute pb-12 top-2 right-2 inline-flex items-center justify-center w-7 h-7   text-[var(--text-primary)]  shadow-sm"
                aria-label="Back"
              >
                <svg
                  className="w-3 h-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M11.5 5L7 9.5L11.5 14"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>

              <div className="w-full">
                <div className="px-3 py-3 space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-[var(--text-tertiary)] mb-0.5">
                        Market
                      </p>
                      <p className="text-sm text-[var(--text-primary)] line-clamp-2">
                        {label}
                      </p>
                    </div>
                    <div className="flex flex-col items-end">

                      <span className="text-lg font-semibold text-[var(--text-primary)] font-number">
                        {yesPercent}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="flex-1 px-4 py-3 rounded-2xl ">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTrade(market as Market, 'yes', event);
                        }}
                        className="inline-flex items-center px-3 py-1 rounded-lg bg-white/10 text-white text-md mb-2 font-semibold shadow-sm hover:bg-white/20 transition-colors"
                      >
                        Yes
                      </button>
                      {yesReturn !== null ? (
                        <p className="text-sm text-[var(--text-tertiary)] font-number">
                          $100 →{' '}
                          <span className="text-emerald-400 font-semibold">
                            ${Math.round(yesReturn)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--text-tertiary)]">—</p>
                      )}
                    </div>
                    <div className="flex-1 px-4 py-3 rounded-2xl ">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenTrade(market as Market, 'no', event);
                        }}
                        className="inline-flex mb-2 items-center px-3 py-1 rounded-lg bg-pink-500/10 text-pink-300 text-md font-semibold shadow-sm hover:bg-pink-500/20 transition-colors"
                      >
                        No
                      </button>
                      {noReturn !== null ? (
                        <p className="text-sm text-[var(--text-tertiary)] font-number">
                          $100 →{' '}
                          <span className="text-emerald-400 font-semibold">
                            ${Math.round(noReturn)}
                          </span>
                        </p>
                      ) : (
                        <p className="text-xs text-[var(--text-tertiary)]">—</p>
                      )}
                    </div>
                  </div>


                </div>
              </div>
            </div>
          );
        })()
      )}
    </div>
  );
}


export default function EventsList({ renderBelowFilters }: { renderBelowFilters?: React.ReactNode }) {
  const router = useRouter();
  const [events, setEvents] = useState<Event[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string>('all');
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
        console.error('Error loading categories:', err);
      }
    };
    loadCategories();
  }, []);

  const filterActiveEvents = (eventsList: Event[]) => {
    return eventsList.filter((event) => {
      if (event.markets && event.markets.length > 0) {
        return event.markets.some(
          (market: any) =>
            market.status !== 'finalized' &&
            market.status !== 'resolved' &&
            market.status !== 'closed' &&
            market.status === 'active'
        );
      }
      return true;
    });
  };

  useEffect(() => {
    const loadEvents = async () => {
      try {
        setLoading(true);
        setError(null);

        // ===== USE DEMO DATA IF ENABLED =====
        if (USE_DEMO_DATA) {
          console.log('🎭 Using demo data (API is down)');
          const activeEvents = filterActiveEvents(DEMO_EVENTS);
          setEvents(activeEvents);
          setFilteredEvents(activeEvents);
          setCursor(undefined);
          setHasMore(false);
          setLoading(false);
          return;
        }
        // ====================================

        const response = await fetchEvents(EVENTS_PER_PAGE, {
          status: 'active',
          withNestedMarkets: true,
        });

        const activeEvents = filterActiveEvents(response.events || []);
        setEvents(activeEvents);
        setFilteredEvents(activeEvents);
    // ===== DEMO MODE: NO PAGINATION =====
    if (USE_DEMO_DATA) return;
    // ====================================

        setCursor(response.cursor);
        setHasMore(!!response.cursor);
      } catch (err: any) {
        setError(err.message || 'Failed to load events');
        console.error('Error loading events:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEvents();
  }, []);

  const loadMoreEvents = useCallback(async () => {
    if (!cursor || loadingMore || !hasMore) return;

    try {
      setLoadingMore(true);
      const response = await fetchEvents(EVENTS_PER_PAGE, {
        status: 'active',
        withNestedMarkets: true,
        cursor,
      });

      const activeEvents = filterActiveEvents(response.events || []);
      setEvents(prev => [...prev, ...activeEvents]);
      setCursor(response.cursor);
      setHasMore(!!response.cursor);
    } catch (err: any) {
      console.error('Error loading more events:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, hasMore]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          loadMoreEvents();
        }
      },
      { threshold: 0.1 }
    );

    const currentTarget = observerTarget.current;
    if (currentTarget) {
      observer.observe(currentTarget);
    }

    return () => {
      if (currentTarget) {
        observer.unobserve(currentTarget);
      }
    };
  }, [hasMore, loadingMore, loadMoreEvents]);

  useEffect(() => {
    let filtered = events;

    // Apply search filter first
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(event => {
        const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();
        return searchText.includes(query);
      });
    }

    // Then apply topic filter
    if (selectedTopic !== 'all') {
      const topic = TOPIC_FILTERS.find(t => t.id === selectedTopic);
      if (topic && topic.keywords.length > 0) {
        filtered = filtered.filter(event => {
          const searchText = `${event.title || ''} ${event.subtitle || ''} ${event.ticker || ''}`.toLowerCase();
          return topic.keywords.some(keyword => searchText.includes(keyword.toLowerCase()));
        });
      }
    }

    setFilteredEvents(filtered);
  }, [selectedTopic, searchQuery, events]);

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

  // Loading skeleton
  if (loading) {
    return (
      <div className="space-y-4">
        {/* Filter skeleton */}
        <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
          {[1, 2, 3, 4, 5, 6, 7].map((i) => (
            <div key={i} className="h-9 w-20 bg-[var(--surface)] rounded-full animate-pulse flex-shrink-0" />
          ))}
        </div>

        {/* Cards skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="h-36 bg-[var(--surface)] rounded-2xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <div className="w-14 h-14 mb-4 bg-red-500/10 rounded-2xl flex items-center justify-center">
          <svg className="w-7 h-7 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <p className="text-[var(--text-secondary)] text-sm mb-3">{error}</p>
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 bg-white text-white text-sm font-medium rounded-xl"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* ===== DEMO MODE BANNER - REMOVE WHEN API IS BACK ===== */}
      {USE_DEMO_DATA && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex items-center gap-3">
          <div className="flex-shrink-0 w-10 h-10 bg-yellow-500/20 rounded-full flex items-center justify-center">
            <span className="text-2xl">🎭</span>
          </div>
          <div className="flex-1">
            <p className="text-yellow-300 font-semibold text-sm">Demo Mode Active</p>
            <p className="text-yellow-300/70 text-xs mt-0.5">
              API is down. Showing demo markets. To disable, set USE_DEMO_DATA = false in demoData.ts
            </p>
          </div>
        </div>
      )}
      {/* ====================================================== */}

      {/* Desktop Search Bar (keeps desktop search accessible) */}
      <div className="hidden md:block">
        <div className="relative max-w-2xl">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none">
            <svg className="w-5 h-5 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markets..."
            className="w-full pl-12 pr-10 py-3 rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/50 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Filters - Horizontal scroll on mobile */}
      <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0">
        {TOPIC_FILTERS.map((topic) => {
          const isSelected = selectedTopic === topic.id;
          // Icon mapping for each filter
          const getIcon = () => {
            switch (topic.id) {
              case 'all':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
                  </svg>
                );
              case 'crypto':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              case 'politics':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                );
              case 'sports':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
                  </svg>
                );
              case 'entertainment':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              case 'tech':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                );
              case 'finance':
                return (
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                );
              default:
                return null;
            }
          };
          
          return (
            <button
              key={topic.id}
              onClick={() => setSelectedTopic(topic.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-md font-medium transition-all duration-200 flex-shrink-0 ${
                isSelected
                  ? 'bg-yellow-300 dark:bg-gray-200 text-black text-lg dark:text-black'
                  : 'bg-black dark:bg-white text-white dark:text-white hover:bg-gray-500/20 dark:hover:bg-slate-700'
              }`}
            >
              {getIcon()}
              <span>{topic.label}</span>
            </button>
          );
        })}
      </div>

      {/* Slot for content below filters (e.g., MarketRail) */}
      {renderBelowFilters}

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
            {(selectedTopic !== 'all' || searchQuery) && (
              <button
                onClick={() => {
                  setSelectedTopic('all');
                  setSearchQuery('');
                }}
                className="text-white text-sm font-medium"
              >
                Clear filters →
              </button>
            )}
          </div>
        ) : (
          filteredEvents.map((event, index) => (
            <EventCard
              key={event.ticker || index}
              event={event}
              onClick={() => handleEventClick(event.ticker)}
              onOpenTrade={handleOpenTradeModal}
              isMobile={isMobile}
            />
          ))
        )}
      </div>

      {/* Infinite scroll trigger */}
      {hasMore && (
        <div ref={observerTarget} className="flex justify-center py-6">
          {loadingMore && (
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          )}
        </div>
      )}

      {/* End indicator */}
      {!hasMore && events.length > 0 && (
        <p className="text-center text-xs text-[var(--text-tertiary)] py-4">
          That's all for now
        </p>
      )}

      {/* Mobile Floating Search - single component expanding left */}
      <motion.div
        className="md:hidden fixed bottom-28 right-4 z-50 pointer-events-auto"
        animate={{
          width: isMobileSearchOpen ? '80vw' : '56px',
          maxWidth: isMobileSearchOpen ? 320 : 56,
          paddingLeft: isMobileSearchOpen ? 16 : 0,
          paddingRight: isMobileSearchOpen ? 16 : 0,
        }}
        transition={{ type: 'tween', duration: 0.22, ease: 'easeInOut' }}
      >
        <div className="flex items-center gap-2 w-full h-14 px-2 border border-[var(--border-color)] rounded-full shadow-2xl bg-[var(--surface)]/90 backdrop-blur-sm origin-right">
          <button
            onClick={() => setIsMobileSearchOpen((prev) => !prev)}
            aria-label="Toggle search"
            className="flex items-center justify-center w-10 h-10 rounded-full text-[var(--text-primary)] hover:text-white transition-colors"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </button>

          <motion.input
            ref={mobileSearchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search markets..."
            className="flex-1 min-w-0 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] text-sm outline-none"
            animate={{
              opacity: isMobileSearchOpen ? 1 : 0,
              x: isMobileSearchOpen ? 0 : 6,
              width: isMobileSearchOpen ? '100%' : '0%',
            }}
            transition={{ type: 'tween', duration: 0.18, ease: 'easeOut' }}
            style={{ pointerEvents: isMobileSearchOpen ? 'auto' : 'none' }}
          />

          <AnimatePresence mode="popLayout">
            {isMobileSearchOpen && searchQuery && (
              <motion.button
                key="clear"
                onClick={() => setSearchQuery('')}
                className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
                aria-label="Clear search"
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.14, ease: 'easeOut' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </motion.button>
            )}
          </AnimatePresence>

          {isMobileSearchOpen && (
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              className="p-2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
              aria-label="Close search"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </motion.div>

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
