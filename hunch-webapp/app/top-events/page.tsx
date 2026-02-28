'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { fetchTopEventsByCategory, Event } from '../lib/api';

const formatVolume = (value?: number) => {
  if (!value || Number.isNaN(value)) return '$—';
  return `$${Intl.NumberFormat('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value)}`;
};

const CATEGORY_LABELS: Record<string, string> = {
  crypto: 'Crypto',
  politics: 'Politics',
  sports: 'Sports',
  entertainment: 'Entertainment',
  tech: 'Tech',
  finance: 'Finance',
};

const CATEGORY_COLORS: Record<string, string> = {
  crypto: 'from-orange-500/20 to-orange-600/20',
  politics: 'from-blue-500/20 to-blue-600/20',
  sports: 'from-green-500/20 to-green-600/20',
  entertainment: 'from-pink-500/20 to-pink-600/20',
  tech: 'from-indigo-500/20 to-indigo-600/20',
  finance: 'from-teal-500/20 to-teal-600/20',
};

function CategoryEventCard({
  category,
  event,
  onClick,
  rank,
}: {
  category: string;
  event: Event & { volume: number; category: string };
  onClick: () => void;
  rank?: number;
}) {
  const categoryLabel = CATEGORY_LABELS[category] || category;
  const categoryColor = CATEGORY_COLORS[category] || 'from-gray-500/20 to-gray-600/20';

  return (
    <div
      onClick={onClick}
      className="group relative flex flex-col gap-3 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-3xl p-4 cursor-pointer transition-all duration-300 card-hover-lift tail-flick-shadow"
    >
      {/* Category Badge */}
      <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-gradient-to-r ${categoryColor} border border-[var(--card-border)] w-fit`}>
        <span className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wide">
          {categoryLabel}
        </span>
      </div>

      {/* Header (image + title) */}
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
          {event.subtitle && (
            <p className="text-sm text-[var(--text-secondary)] mt-1 line-clamp-1">
              {event.subtitle}
            </p>
          )}
        </div>
      </div>

      {/* Volume */}
      <div className="flex items-center justify-between pt-2 border-t border-[var(--card-border)]">
        <div className="flex flex-col">
          <span className="text-xs text-[var(--text-tertiary)]">Volume</span>
          <span className="text-lg font-bold text-[var(--text-primary)]">
            {formatVolume(event.volume)}
          </span>
        </div>
        <div className="text-right">
          <span className="text-xs text-[var(--text-tertiary)]">{rank ? 'Rank' : 'Top Event'}</span>
          <div className="text-sm font-medium text-[var(--accent)]">
            {rank ? `#${rank}` : 'View →'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function TopEventsPage() {
  const router = useRouter();
  const [topEvents, setTopEvents] = useState<Record<string, Array<Event & { volume: number; category: string }>>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [perCategory, setPerCategory] = useState(3);

  useEffect(() => {
    const loadTopEvents = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchTopEventsByCategory({
          limit: 100,
          perCategory: 3,
        });
        setTopEvents(data.categories);
        if (data.perCategory) {
          setPerCategory(data.perCategory);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load top events');
        console.error('Error loading top events:', err);
      } finally {
        setLoading(false);
      }
    };

    loadTopEvents();
  }, []);

  const handleEventClick = (eventTicker: string) => {
    router.push(`/event/${encodeURIComponent(eventTicker)}`);
  };

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
              Top Events by Category
            </h1>
            <p className="text-[var(--text-secondary)]">
              Highest volume events across different categories
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => (
              <div key={i} className="h-48 bg-[var(--surface)] rounded-3xl animate-pulse" />
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
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[var(--accent)] text-white rounded-lg hover:opacity-90 transition-opacity"
            >
              Try Again
            </button>
          </div>
        </main>
      </div>
    );
  }

  const categories = Object.keys(topEvents);
  const sortedCategories = categories.sort((a, b) => {
    const volumeA = topEvents[a]?.[0]?.volume || 0;
    const volumeB = topEvents[b]?.[0]?.volume || 0;
    return volumeB - volumeA;
  });

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            Top Events by Category
          </h1>
          <p className="text-[var(--text-secondary)]">
            Highest volume events across {categories.length} categories (top {perCategory} each)
          </p>
        </div>

        {/* Events Grid */}
        {sortedCategories.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-16 h-16 mb-4 rounded-full bg-[var(--surface)] flex items-center justify-center">
              <svg className="w-8 h-8 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <p className="text-[var(--text-secondary)] text-lg">No events found</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedCategories.map((category) => {
              const events = topEvents[category] || [];
              const categoryLabel = CATEGORY_LABELS[category] || category;
              return (
                <section key={category} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="text-xl font-semibold text-[var(--text-primary)]">{categoryLabel}</h2>
                      <p className="text-[var(--text-secondary)]">Top {events.length} events by volume</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {events.map((event, index) => (
                      <CategoryEventCard
                        key={`${category}-${event.ticker}-${index}`}
                        category={category}
                        event={event}
                        rank={index + 1}
                        onClick={() => handleEventClick(event.ticker)}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

