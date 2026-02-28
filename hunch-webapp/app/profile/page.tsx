'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useEffect, useState, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import Profile from '../components/Profile';
import { useTheme } from '../components/ThemeProvider';
import { useAuth } from '../components/AuthContext';

export default function ProfilePage() {
  const { ready, authenticated, logout } = usePrivy();
  const { theme, toggleTheme } = useTheme();
  const { showLoginModal } = useAuth();
  const [showSettings, setShowSettings] = useState(false);
  const settingsRef = useRef<HTMLDivElement>(null);

  // Close settings menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Show login modal if not authenticated
  useEffect(() => {
    if (ready && !authenticated) {
      showLoginModal('Sign in to view your profile');
    }
  }, [ready, authenticated, showLoginModal]);

  // Show loading while Privy initializes
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  // Show prompt to login if not authenticated
  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center px-6">
          <div className="w-20 h-20 mx-auto mb-6 rounded-full bg-[var(--surface)] border border-[var(--border-color)] flex items-center justify-center">
            <svg className="w-10 h-10 text-[var(--text-tertiary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">View Your Profile</h2>
          <p className="text-[var(--text-secondary)] mb-6">Sign in to see your trades, positions, and activity</p>
          <button
            onClick={() => showLoginModal('Sign in to view your profile')}
            className="px-8 py-3 bg-gradient-to-r from-white to-gray-500 hover:from-white hover:to-gray-400 text-white rounded-xl font-semibold transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--background)]"
      style={{ fontFamily: 'var(--font-inter)' }}
    >
      {/* Top Right Settings Button */}
      <div className="fixed top-4 right-4 z-50" ref={settingsRef}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`p-4 rounded-full bg-[var(--surface)] transition-all duration-200 hover:scale-105 ${
            showSettings ? 'bg-[var(--surface-hover)]' : ''
          }`}
          title="Menu"
        >
          <svg
            className="w-6 h-6 text-[var(--text-secondary)]"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        </button>
      </div>

      {/* Bottom Drawer for settings */}
      <AnimatePresence>
        {showSettings && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
              onClick={() => setShowSettings(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-[var(--surface)] border-t border-[var(--border-color)] rounded-t-2xl shadow-2xl"
              role="dialog"
              aria-modal="true"
            >
            <div className="px-5 pt-4 pb-6 space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">Quick Actions</span>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-2 rounded-full bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  aria-label="Close"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <button
                onClick={() => {
                  toggleTheme();
                  setShowSettings(false);
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-[var(--surface-hover)] text-[var(--text-primary)] border border-[var(--border-color)] hover:translate-y-[-1px] transition-all"
              >
                <div className="flex items-center gap-3">
                  {theme === 'dark' ? (
                    <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                  ) : (
                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                    </svg>
                  )}
                  <span className="text-sm font-medium">{theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}</span>
                </div>
                <span className="text-xs text-[var(--text-tertiary)]">{theme === 'dark' ? 'Light' : 'Dark'}</span>
              </button>

              <button
                onClick={async () => {
                  setShowSettings(false);
                  await logout();
                }}
                className="w-full flex items-center justify-between px-4 py-3 rounded-xl bg-red-500/10 text-red-200 border border-red-500/30 hover:bg-red-500/15 transition-all"
              >
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                  </svg>
                  <span className="text-sm font-semibold">Logout</span>
                </div>
                <span className="text-xs text-red-200/80">Exit</span>
              </button>
            </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        <Profile />
      </main>
    </div>
  );
}
