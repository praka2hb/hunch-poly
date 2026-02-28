'use client';

import { motion } from 'framer-motion';
import { useCatSafe } from '../contexts/CatContext';

// Small paw icon SVG
function PawIcon({ className = '' }: { className?: string }) {
    return (
        <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={className}
        >
            {/* Main pad */}
            <ellipse cx="12" cy="16" rx="5" ry="4" />
            {/* Top pads */}
            <circle cx="7" cy="9" r="2.5" />
            <circle cx="17" cy="9" r="2.5" />
            <circle cx="10" cy="6" r="2" />
            <circle cx="14" cy="6" r="2" />
        </svg>
    );
}

interface InstinctPillProps {
    side: 'yes' | 'no';
    onClick: () => void;
    disabled?: boolean;
    loading?: boolean;
    children?: React.ReactNode;
    className?: string;
    showPaw?: boolean;
    breathing?: boolean;
}

export default function InstinctPill({
    side,
    onClick,
    disabled = false,
    loading = false,
    children,
    className = '',
    showPaw = true,
    breathing = true,
}: InstinctPillProps) {
    const catContext = useCatSafe();

    const handleClick = () => {
        if (disabled || loading) return;

        // Trigger peek cat on click
        if (catContext) {
            catContext.triggerPeekCat();
        }

        onClick();
    };

    const baseClasses = `instinct-pill ${side === 'yes' ? 'instinct-pill-yes' : 'instinct-pill-no'}`;
    const breathingClass = breathing && !disabled && !loading ? (side === 'yes' ? 'animate-breathing' : 'animate-breathing-magenta') : '';

    return (
        <motion.button
            onClick={handleClick}
            disabled={disabled || loading}
            className={`${baseClasses} ${breathingClass} ${className}`}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 400, damping: 17 }}
        >
            {loading ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            ) : (
                <>
                    {showPaw && <PawIcon className="opacity-80" />}
                    <span>{children || (side === 'yes' ? 'Yes' : 'No')}</span>
                </>
            )}
        </motion.button>
    );
}

// Compact version for use in cards
export function InstinctPillCompact({
    side,
    onClick,
    disabled = false,
    className = '',
}: {
    side: 'yes' | 'no';
    onClick: () => void;
    disabled?: boolean;
    className?: string;
}) {
    return (
        <motion.button
            onClick={onClick}
            disabled={disabled}
            className={`
        px-3 py-1.5 rounded-full font-semibold text-sm transition-all
        ${side === 'yes'
                    ? 'bg-gradient-to-r from-[#facc15] to-[#fbbf24] text-[#0D0D0F] hover:shadow-[0_0_16px_var(--glow-cyan)]'
                    : 'bg-gradient-to-r from-[#E879F9] to-[#F0ABFC] text-[#0D0D0F] hover:shadow-[0_0_16px_var(--glow-magenta)]'
                }
        disabled:opacity-50 disabled:cursor-not-allowed
        ${className}
      `}
            whileTap={{ scale: 0.95 }}
        >
            {side === 'yes' ? 'Yes' : 'No'}
        </motion.button>
    );
}
