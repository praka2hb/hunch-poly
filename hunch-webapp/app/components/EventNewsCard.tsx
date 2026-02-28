'use client';

import { useEffect, useState } from 'react';

interface EventEvidence {
  eventTicker: string;
  headline: string;
  explanation: string;
  classification: string;
  sourceUrls: string[];
  sourceTitles: string[];
  createdAt: string;
}

const CLASSIFICATION_STYLES = {
  CONFIRMATION: {
    badge: 'bg-green-500/10 text-green-600 border-green-500/30',
    icon: '✓',
    label: 'Confirmed',
  },
  REQUIREMENT: {
    badge: 'bg-blue-500/10 text-blue-600 border-blue-500/30',
    icon: '!',
    label: 'Required',
  },
  DELAY: {
    badge: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/30',
    icon: '⏳',
    label: 'Delayed',
  },
  RISK: {
    badge: 'bg-red-500/10 text-red-600 border-red-500/30',
    icon: '⚠',
    label: 'Risk',
  },
  NONE: {
    badge: 'bg-gray-500/10 text-gray-600 border-gray-500/30',
    icon: '—',
    label: 'No Signal',
  },
};

export default function EventNewsCard({
  eventTicker,
}: {
  eventTicker: string;
}) {
  const [evidence, setEvidence] = useState<EventEvidence | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEvidence = async () => {
      try {
        const response = await fetch(
          `/api/events/evidence?eventTickers=${eventTicker}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.evidence && data.evidence.length > 0) {
            setEvidence(data.evidence[0]);
          }
        }
      } catch (error) {
        console.error('Error fetching evidence:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEvidence();
  }, [eventTicker]);

  if (loading || !evidence || !evidence.headline) return null;

  const style =
    CLASSIFICATION_STYLES[
      evidence.classification as keyof typeof CLASSIFICATION_STYLES
    ] || CLASSIFICATION_STYLES.NONE;

  return (
    <div className="relative bg-gradient-to-br from-[var(--card-bg)] to-[var(--surface)] border border-[var(--card-border)] rounded-2xl p-4 shadow-lg backdrop-blur-sm">
      {/* Classification Badge */}
      <div className="flex items-center gap-2 mb-3">
        <div
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-semibold ${style.badge}`}
        >
          <span>{style.icon}</span>
          <span>{style.label}</span>
        </div>
        <div className="flex-1 h-px bg-gradient-to-r from-[var(--card-border)] to-transparent" />
      </div>

      {/* Headline */}
      <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2 leading-snug">
        {evidence.headline}
      </h3>

      {/* Explanation */}
      <p className="text-sm text-[var(--text-secondary)] mb-4 leading-relaxed">
        {evidence.explanation}
      </p>

      {/* Sources */}
      <div className="space-y-2">
        <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide">
          Sources ({evidence.sourceUrls.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {evidence.sourceUrls.slice(0, 3).map((url, index) => (
            <a
              key={index}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="group flex items-center gap-1.5 px-3 py-1.5 bg-[var(--surface)] hover:bg-[var(--accent)]/10 border border-[var(--card-border)] hover:border-[var(--accent)]/30 rounded-lg transition-all duration-200 text-xs"
            >
              <svg
                className="w-3 h-3 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                />
              </svg>
              <span className="text-[var(--text-secondary)] group-hover:text-[var(--accent)] font-medium transition-colors truncate max-w-[120px]">
                {evidence.sourceTitles[index]?.split(' - ')[0] || `Source ${index + 1}`}
              </span>
            </a>
          ))}
        </div>
      </div>

      {/* Gradient Accent Border */}
      <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-[var(--accent)]/5 via-transparent to-transparent pointer-events-none" />
    </div>
  );
}
