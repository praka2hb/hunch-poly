'use client';

import { useEffect, useState, useRef } from 'react';

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
        bg: 'bg-green-500/10',
        text: 'text-green-500',
        border: 'border-green-500/30',
        icon: '✓',
        label: 'Bullish Signal',
    },
    REQUIREMENT: {
        bg: 'bg-blue-500/10',
        text: 'text-blue-500',
        border: 'border-blue-500/30',
        icon: '📋',
        label: 'Key Requirement',
    },
    DELAY: {
        bg: 'bg-yellow-500/10',
        text: 'text-yellow-500',
        border: 'border-yellow-500/30',
        icon: '⏳',
        label: 'Delay Alert',
    },
    RISK: {
        bg: 'bg-red-500/10',
        text: 'text-red-500',
        border: 'border-red-500/30',
        icon: '⚠️',
        label: 'Risk Warning',
    },
    NONE: {
        bg: 'bg-gray-500/10',
        text: 'text-gray-500',
        border: 'border-gray-500/30',
        icon: '—',
        label: 'No Signal',
    },
};

export default function EventNewsHeadline({
    eventTicker,
    compact = false,
}: {
    eventTicker: string;
    compact?: boolean;
}) {
    const [evidence, setEvidence] = useState<EventEvidence | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSources, setShowSources] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

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

    // Close menu when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setShowSources(false);
            }
        };

        if (showSources) {
            document.addEventListener('mousedown', handleClickOutside);
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showSources]);

    if (loading) {
        return (
            <div className="animate-pulse flex items-center gap-2">
                <div className="h-4 w-4 rounded-full bg-[var(--surface)]" />
                <div className="h-3 w-32 rounded bg-[var(--surface)]" />
            </div>
        );
    }

    if (!evidence || !evidence.headline || evidence.classification === 'NONE') {
        return null;
    }

    const style =
        CLASSIFICATION_STYLES[
        evidence.classification as keyof typeof CLASSIFICATION_STYLES
        ] || CLASSIFICATION_STYLES.NONE;

    if (compact) {
        return (
            <div className="flex items-start gap-2 py-2">
                {/* Signal Icon */}
                <div className={`flex-shrink-0 w-6 h-6 rounded-full ${style.bg} ${style.border} border flex items-center justify-center`}>
                    <span className="text-xs">{style.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold ${style.text} mb-0.5`}>
                        {style.label}
                    </p>
                    <p className="text-sm text-[var(--text-primary)] font-medium line-clamp-2">
                        {evidence.headline}
                    </p>
                </div>

                {/* 3 Dots Menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSources(!showSources);
                        }}
                        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors"
                    >
                        <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="6" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="18" r="2" />
                        </svg>
                    </button>

                    {/* Sources Dropdown */}
                    {showSources && (
                        <div className="absolute right-0 top-8 z-50 w-64 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl p-3 space-y-2">
                            <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide px-1">
                                Sources ({evidence.sourceUrls.length})
                            </div>
                            {evidence.sourceUrls.slice(0, 3).map((url, index) => (
                                <a
                                    key={index}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-[var(--surface)] transition-colors"
                                >
                                    <svg className="w-4 h-4 text-[var(--accent)] flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    <span className="text-sm text-[var(--text-primary)] truncate">
                                        {evidence.sourceTitles[index]?.split(' - ')[0] || `Source ${index + 1}`}
                                    </span>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // Full version
    return (
        <div className={`relative ${style.bg} ${style.border} border rounded-xl p-3`}>
            <div className="flex items-start gap-3">
                {/* Signal Badge */}
                <div className={`flex-shrink-0 w-8 h-8 rounded-full ${style.bg} border ${style.border} flex items-center justify-center`}>
                    <span className="text-sm">{style.icon}</span>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold ${style.text} uppercase tracking-wide mb-1`}>
                        {style.label}
                    </p>
                    <p className="text-sm font-semibold text-[var(--text-primary)] leading-snug mb-1">
                        {evidence.headline}
                    </p>
                    {evidence.explanation && (
                        <p className="text-xs text-[var(--text-secondary)] line-clamp-2">
                            {evidence.explanation}
                        </p>
                    )}
                </div>

                {/* 3 Dots Menu */}
                <div className="relative" ref={menuRef}>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setShowSources(!showSources);
                        }}
                        className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface)] transition-colors"
                    >
                        <svg className="w-4 h-4 text-[var(--text-tertiary)]" fill="currentColor" viewBox="0 0 24 24">
                            <circle cx="12" cy="6" r="2" />
                            <circle cx="12" cy="12" r="2" />
                            <circle cx="12" cy="18" r="2" />
                        </svg>
                    </button>

                    {/* Sources Dropdown */}
                    {showSources && (
                        <div className="absolute right-0 top-9 z-50 w-72 bg-[var(--card-bg)] border border-[var(--card-border)] rounded-xl shadow-xl p-3 space-y-2">
                            <div className="text-xs font-semibold text-[var(--text-tertiary)] uppercase tracking-wide px-1 mb-2">
                                📰 Source Articles
                            </div>
                            {evidence.sourceUrls.slice(0, 3).map((url, index) => (
                                <a
                                    key={index}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                    className="flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-[var(--surface)] transition-colors group"
                                >
                                    <svg className="w-4 h-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent)] mt-0.5 flex-shrink-0 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-[var(--text-primary)] group-hover:text-[var(--accent)] font-medium truncate transition-colors">
                                            {evidence.sourceTitles[index]?.split(' - ')[0] || `Source ${index + 1}`}
                                        </p>
                                        <p className="text-xs text-[var(--text-tertiary)] truncate">
                                            {new URL(url).hostname.replace('www.', '')}
                                        </p>
                                    </div>
                                </a>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
