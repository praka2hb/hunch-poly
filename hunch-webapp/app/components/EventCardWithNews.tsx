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
        bg: 'from-green-500/20 via-green-600/10 to-transparent',
        border: 'border-green-500/30',
        accent: 'text-green-500',
        icon: '📈',
    },
    REQUIREMENT: {
        bg: 'from-blue-500/20 via-blue-600/10 to-transparent',
        border: 'border-blue-500/30',
        accent: 'text-blue-500',
        icon: '📋',
    },
    DELAY: {
        bg: 'from-yellow-500/20 via-yellow-600/10 to-transparent',
        border: 'border-yellow-500/30',
        accent: 'text-yellow-500',
        icon: '⏳',
    },
    RISK: {
        bg: 'from-red-500/20 via-red-600/10 to-transparent',
        border: 'border-red-500/30',
        accent: 'text-red-500',
        icon: '⚠️',
    },
    NONE: {
        bg: 'from-gray-500/10 via-gray-600/5 to-transparent',
        border: 'border-gray-500/20',
        accent: 'text-gray-500',
        icon: '📰',
    },
};

export default function EventCardWithNews({
    eventTicker,
    children,
}: {
    eventTicker: string;
    children: React.ReactNode;
}) {
    const [evidence, setEvidence] = useState<EventEvidence | null>(null);
    const [loading, setLoading] = useState(true);
    const [showSources, setShowSources] = useState(false);

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

    // If no evidence, just render the children directly
    if (loading || !evidence || !evidence.headline || evidence.classification === 'NONE') {
        return <>{children}</>;
    }

    const style =
        CLASSIFICATION_STYLES[
        evidence.classification as keyof typeof CLASSIFICATION_STYLES
        ] || CLASSIFICATION_STYLES.NONE;

    return (
        <div className="flex flex-col gap-0 group">
            {/* News Intelligence Card - Sits on TOP */}
            <div
                className={`relative overflow-hidden rounded-t-3xl border-x border-t ${style.border} bg-gradient-to-br ${style.bg} backdrop-blur-xl transition-all duration-300`}
                onClick={(e) => e.stopPropagation()}
            >
                {/* Decorative glow */}
                <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${style.bg} opacity-50 blur-2xl rounded-full -translate-y-1/2 translate-x-1/2`} />

                <div className="relative p-5">
                    {/* Header Row: Signal + Label + Sources */}
                    <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <div className={`flex items-center justify-center w-8 h-8 rounded-full bg-white/10 backdrop-blur-sm border border-white/10 shadow-sm text-lg`}>
                                {style.icon}
                            </div>
                            <div className="flex flex-col">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${style.accent} opacity-90`}>
                                    Market Intel
                                </span>
                                <span className="text-xs font-medium text-[var(--text-secondary)] opacity-80">
                                    {new Date(evidence.createdAt).toLocaleDateString()}
                                </span>
                            </div>
                        </div>

                        {/* Source Links - clean pills */}
                        <div className="flex items-center gap-1.5 grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300">
                            {evidence.sourceUrls.slice(0, 2).map((url, i) => (
                                <a
                                    key={i}
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex items-center justify-center w-6 h-6 rounded-full bg-[var(--surface)] hover:bg-[var(--card-bg)] border border-transparent hover:border-[var(--card-border)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-all"
                                    title={evidence.sourceTitles[i] || 'Source'}
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                    </svg>
                                </a>
                            ))}
                        </div>
                    </div>

                    {/* Content */}
                    <div className="space-y-2">
                        <h4 className="text-lg font-bold text-[var(--text-primary)] leading-tight tracking-tight">
                            {evidence.headline}
                        </h4>
                        <p className="text-sm text-[var(--text-secondary)] leading-relaxed border-l-2 border-[var(--text-tertiary)]/20 pl-3">
                            {evidence.explanation}
                        </p>
                    </div>
                </div>
            </div>

            {/* Main Event Card - Sits BELOW, connected visually */}
            <div className="relative z-10 -mt-1 rounded-b-3xl shadow-sm">
                {children}
            </div>
        </div>
    );
}
