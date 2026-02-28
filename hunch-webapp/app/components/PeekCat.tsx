'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useCatSafe } from '../contexts/CatContext';

// Minimalist cat silhouette - just eyes and ears
function CatSilhouette() {
    return (
        <svg
            width="48"
            height="32"
            viewBox="0 0 48 32"
            fill="none"
            className="text-[var(--accent)]"
        >
            {/* Left ear */}
            <path
                d="M8 16 L4 4 L14 10 Z"
                fill="currentColor"
                opacity="0.9"
            />
            {/* Right ear */}
            <path
                d="M40 16 L44 4 L34 10 Z"
                fill="currentColor"
                opacity="0.9"
            />
            {/* Left eye */}
            <ellipse
                cx="16"
                cy="18"
                rx="3"
                ry="4"
                fill="currentColor"
            />
            {/* Right eye */}
            <ellipse
                cx="32"
                cy="18"
                rx="3"
                ry="4"
                fill="currentColor"
            />
            {/* Eye pupils - subtle slits */}
            <ellipse
                cx="16"
                cy="18"
                rx="1"
                ry="3"
                fill="var(--background)"
            />
            <ellipse
                cx="32"
                cy="18"
                rx="1"
                ry="3"
                fill="var(--background)"
            />
        </svg>
    );
}

export default function PeekCat() {
    const catContext = useCatSafe();

    // If no context, render nothing
    if (!catContext) return null;

    const { isVisible, message } = catContext;

    return (
        <AnimatePresence>
            {isVisible && (
                <motion.div
                    className="fixed bottom-32 right-6 z-[100] flex flex-col items-center gap-2 pointer-events-none"
                    initial={{ opacity: 0, y: 20, scale: 0.8 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -10, scale: 0.9 }}
                    transition={{
                        type: 'spring',
                        stiffness: 300,
                        damping: 20
                    }}
                >
                    {/* Cat silhouette */}
                    <motion.div
                        initial={{ y: 10 }}
                        animate={{ y: [0, -3, 0] }}
                        transition={{
                            repeat: 1,
                            duration: 0.4,
                            ease: 'easeInOut'
                        }}
                    >
                        <CatSilhouette />
                    </motion.div>

                    {/* Message */}
                    {message && (
                        <motion.span
                            className="text-xs text-[var(--text-tertiary)] font-medium tracking-wide"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ delay: 0.2 }}
                        >
                            {message}
                        </motion.span>
                    )}
                </motion.div>
            )}
        </AnimatePresence>
    );
}
