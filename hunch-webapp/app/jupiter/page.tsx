'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import {
  fetchJupiterEvents,
  formatMicroUsd,
  type PredictionEvent,
  type EventsResponse,
} from '../lib/jupiter-prediction';

const PAGE_SIZE = 20;
const CATEGORIES = ['all', 'crypto', 'sports', 'politics', 'esports', 'culture', 'economics', 'tech'] as const;
const FILTERS = ['new', 'live', 'trending'] as const;

export default function JupiterPage() {
  const [events, setEvents] = useState<PredictionEvent[]>([]);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(true);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [category, setCategory] = useState<string>('all');
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const nextStart = useRef(0);
  const observerTarget = useRef<HTMLDivElement>(null);

  const loadPage = useCallback(
    async (append: boolean, overrides?: { category?: string; filter?: string | undefined }) => {
      const cat = overrides?.category ?? category;
      const filt = overrides && 'filter' in overrides ? overrides.filter : filter;
      const start = append ? nextStart.current : 0;
      const end = start + PAGE_SIZE - 1;
      if (append) setLoadingMore(true);
      else setLoading(true);
      setError(null);
      try {
        const res = await fetchJupiterEvents({
          includeMarkets: false,
          category: cat === 'all' ? undefined : cat,
          sortBy: 'volume',
          sortDirection: 'desc',
          filter: filt as 'new' | 'live' | 'trending' | undefined,
          start,
          end,
        });
        const list = res.data ?? [];
        const pagination = res.pagination;
        setTotal(pagination?.total ?? 0);
        setHasNext(pagination?.hasNext ?? false);
        nextStart.current = (pagination?.end ?? end) + 1;
        setEvents((prev) => (append ? [...prev, ...list] : list));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load events');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [category, filter]
  );

  useEffect(() => {
    nextStart.current = 0;
    loadPage(false);
  }, [loadPage]);

  useEffect(() => {
    const el = observerTarget.current;
    if (!el || loading || loadingMore || !hasNext) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNext && !loading && !loadingMore) {
          loadPage(true);
        }
      },
      { rootMargin: '200px', threshold: 0.1 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNext, loading, loadingMore, loadPage]);

  const applyFilters = () => {
    nextStart.current = 0;
    loadPage(false);
  };

  const clearFilters = () => {
    setCategory('all');
    setFilter(undefined);
    setShowFilters(false);
    nextStart.current = 0;
    setEvents([]);
    setHasNext(true);
    loadPage(false, { category: 'all', filter: undefined });
  };

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            Jupiter Prediction Terminal
          </h1>
          <p className="text-[var(--text-secondary)]">
            Events from Kalshi. View markets and explore the social terminal.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Link
              href="/jupiter/social"
              className="text-[var(--accent)] hover:underline text-sm font-medium"
            >
              Social Terminal →
            </Link>
            {!showFilters ? (
              <button
                type="button"
                onClick={() => setShowFilters(true)}
                className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-colors"
              >
                Add Filter
              </button>
            ) : (
              <>
                <span className="text-[var(--text-tertiary)] text-sm">Category:</span>
                {CATEGORIES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setCategory(c)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
                      category === c ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {c}
                  </button>
                ))}
                <span className="text-[var(--text-tertiary)] text-sm ml-2">Filter:</span>
                {FILTERS.map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1.5 rounded-full text-sm font-medium capitalize ${
                      filter === f ? 'bg-[var(--accent)] text-white' : 'bg-[var(--surface)] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]'
                    }`}
                  >
                    {f}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={applyFilters}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--accent)] text-white"
                >
                  Apply
                </button>
                <button
                  type="button"
                  onClick={clearFilters}
                  className="px-3 py-1.5 rounded-full text-sm font-medium bg-[var(--surface)] text-[var(--text-secondary)] border border-[var(--border-color)] hover:bg-[var(--surface-hover)]"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        </div>

        {loading && events.length === 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-48 bg-[var(--surface)] rounded-2xl animate-pulse border border-[var(--border-color)]" />
            ))}
          </div>
        )}

        {error && events.length === 0 && (
          <div className="rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] p-6 text-center">
            <p className="text-[var(--text-secondary)] mb-4">{error}</p>
            <button
              onClick={() => loadPage(false)}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl hover:opacity-90 transition-opacity"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {events.map((event) => (
                <EventCard key={event.eventId} event={event} />
              ))}
            </div>
            {events.length === 0 && (
              <div className="text-center py-12 text-[var(--text-secondary)]">
                No events found.
              </div>
            )}
            {total > 0 && events.length > 0 && (
              <p className="mt-4 text-sm text-[var(--text-secondary)]">
                Showing {events.length} of {total} events
              </p>
            )}
            <div ref={observerTarget} className="h-12 flex items-center justify-center">
              {loadingMore && (
                <div className="w-6 h-6 border-2 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function EventCard({ event }: { event: PredictionEvent }) {
  const title = event.metadata?.title ?? event.eventId;
  const subtitle = event.metadata?.subtitle;
  const imageUrl = event.metadata?.imageUrl;
  const isLive = event.metadata?.isLive;
  const volume = event.volumeUsd != null ? formatMicroUsd(event.volumeUsd) : '—';
  const category = event.category ?? '';

  return (
    <Link
      href={`/jupiter/events/${encodeURIComponent(event.eventId)}`}
      className="block rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] overflow-hidden hover:border-[var(--accent)]/50 transition-colors"
    >
      <div className="aspect-[16/10] bg-[var(--surface)] relative">
        {imageUrl ? (
          <img
            src={imageUrl}
            alt=""
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[var(--text-tertiary)] text-4xl">
            —
          </div>
        )}
        <div className="absolute top-2 left-2 flex gap-2">
          {category && (
            <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-xs font-medium capitalize">
              {category}
            </span>
          )}
          {isLive && (
            <span className="px-2 py-0.5 rounded-md bg-green-600/90 text-white text-xs font-medium">
              Live
            </span>
          )}
        </div>
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-[var(--text-primary)] line-clamp-2 mb-1">{title}</h3>
        {subtitle && (
          <p className="text-sm text-[var(--text-secondary)] line-clamp-1 mb-2">{subtitle}</p>
        )}
        <p className="text-sm text-[var(--text-tertiary)]">Volume {volume}</p>
        <span className="inline-block mt-2 text-sm font-medium text-[var(--accent)]">View Markets →</span>
      </div>
    </Link>
  );
}
