'use client';

import { usePrivy, useLogin } from '@privy-io/react-auth';
import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useTheme } from './ThemeProvider';
import { normalizeTwitterAvatarUrl } from '@/lib/utils';

export default function Navbar() {
  const { ready, authenticated, user, logout } = usePrivy();
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
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

  const { login } = useLogin({
    onComplete: () => {
      router.push('/home');
    },
  });

  useEffect(() => {
    setMounted(true);
  }, []);

  const isActive = (path: string) => pathname === path;

  // Get user display info
  const getUserInfo = () => {
    if (!user) return { name: 'Guest', email: '', avatar: null };

    const email = user.email?.address || user.google?.email || '';
    
    // Use direct user properties (same as Profile.tsx)
    const name = user.twitter?.username 
      ? `@${user.twitter.username}` 
      : user.google?.name || email.split('@')[0] || 'User';
    
    // Get avatar from twitter or google directly on user object
    const avatar = normalizeTwitterAvatarUrl(user.twitter?.profilePictureUrl);

    return { name, email, avatar };
  };

  const { name, email, avatar } = getUserInfo();

  const handleLogin = async () => {
    try {
      await login();
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setShowProfileMenu(false);
      router.push('/home');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!mounted) {
    return (
      <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-24 flex-col items-center py-6 px-2 bg-[var(--nav-bg)] border-r border-[var(--border-color)] z-50">
        {/* Logo hidden */}
      </nav>
    );
  }

  // Hide sidebar on login/root page
  if (pathname === '/') {
    return null;
  }

  return (
    <nav className="hidden md:flex fixed left-0 top-0 bottom-0 w-24 flex-col items-center py-6 px-2 bg-[var(--nav-bg)] backdrop-blur-xl border-r border-[var(--border-color)] z-50">
      {/* Logo hidden */}

      {/* Navigation Links - Always visible */}
      <div className="flex-1 flex flex-col items-center gap-4 pt-32">
        {/* Home */}
        <Link
          href="/home"
          className={`p-4 rounded-xl transition-all duration-200 ${isActive('/home')
            ? 'bg-[var(--surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          title="Home"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </Link>

        {/* Social Feed */}
        <Link
          href="/social"
          className={`p-4 rounded-xl transition-all duration-200 ${isActive('/social')
            ? 'bg-[var(--surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          title="Social Feed"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
            />
          </svg>
        </Link>

        {/* Jupiter Prediction */}
        <Link
          href="/jupiter"
          className={`p-4 rounded-xl transition-all duration-200 ${pathname === '/jupiter' || pathname.startsWith('/jupiter/')
            ? 'bg-[var(--surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          title="Jupiter Prediction"
        >
          <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        </Link>

        {/* Profile */}
        <Link
          href="/profile"
          className={`p-4 rounded-xl transition-all duration-200 ${isActive('/profile')
            ? 'bg-[var(--surface)] text-[var(--text-primary)]'
            : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
            }`}
          title="Profile"
        >
          {authenticated && avatar ? (
            <img 
              src={avatar} 
              alt={name} 
              className={`w-8 h-8 rounded-full object-cover ${isActive('/profile') ? 'ring-2 ring-white' : ''}`}
            />
          ) : (
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          )}
        </Link>
      </div>

      {/* Settings section at bottom */}
      <div className="mt-auto pt-4 border-t border-[var(--border-color)] w-full px-2 relative" ref={settingsRef}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className={`w-full p-3 rounded-xl transition-all flex items-center justify-center gap-2 ${
            showSettings 
              ? 'bg-[var(--surface)] text-[var(--text-primary)]' 
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--surface-hover)]'
          }`}
          title="Settings"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>

        {/* Settings Dropdown */}
        {showSettings && (
          <div className="absolute bottom-full left-2 right-2 mb-2 bg-[var(--surface)] border border-[var(--border-color)] rounded-xl shadow-xl overflow-hidden">
            {/* Theme Toggle */}
            <button
              onClick={() => {
                toggleTheme();
                setShowSettings(false);
              }}
              className="w-full px-4 py-3 flex items-center gap-3 text-[var(--text-secondary)] hover:bg-[var(--surface-hover)] hover:text-[var(--text-primary)] transition-all"
            >
              {theme === 'dark' ? (
                <svg className="w-5 h-5 text-yellow-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
              <span className="text-sm font-medium">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </button>

            {/* Logout */}
            {authenticated && (
              <button
                onClick={() => {
                  handleLogout();
                  setShowSettings(false);
                }}
                className="w-full px-4 py-3 flex items-center gap-3 text-[var(--text-secondary)] hover:bg-red-500/10 hover:text-red-400 transition-all border-t border-[var(--border-color)]"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                <span className="text-sm font-medium">Logout</span>
              </button>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
