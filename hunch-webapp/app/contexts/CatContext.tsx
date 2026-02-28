'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react';

interface CatContextType {
    triggerPeekCat: (message?: string) => void;
    isVisible: boolean;
    message: string;
}

const CatContext = createContext<CatContextType | null>(null);

// Cat-themed messages for different actions
const PEEK_MESSAGES = [
    'Good hunch.',
    'You sensed it early.',
    'Watching quietly.',
    'Sharp instinct.',
    'Trust your gut.',
];

export function CatProvider({ children }: { children: ReactNode }) {
    const [isVisible, setIsVisible] = useState(false);
    const [message, setMessage] = useState('');

    const triggerPeekCat = useCallback((customMessage?: string) => {
        // Don't trigger if already visible
        if (isVisible) return;

        const displayMessage = customMessage || PEEK_MESSAGES[Math.floor(Math.random() * PEEK_MESSAGES.length)];
        setMessage(displayMessage);
        setIsVisible(true);

        // Auto-hide after animation
        setTimeout(() => {
            setIsVisible(false);
            setMessage('');
        }, 2000);
    }, [isVisible]);

    return (
        <CatContext.Provider value={{ triggerPeekCat, isVisible, message }}>
            {children}
        </CatContext.Provider>
    );
}

export function useCat() {
    const context = useContext(CatContext);
    if (!context) {
        throw new Error('useCat must be used within a CatProvider');
    }
    return context;
}

// Optional hook that won't throw if context is missing
export function useCatSafe() {
    return useContext(CatContext);
}
