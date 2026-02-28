'use client';

import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthContext';
import { useEffect, useState, useLayoutEffect } from 'react';
import { normalizeTwitterAvatarUrl } from '@/lib/utils';

export default function BottomNavbar() {
  const { ready, authenticated, user } = usePrivy();
  const pathname = usePathname();
  const { isLoginModalOpen } = useAuth();
  const [isTradeModalOpen, setIsTradeModalOpen] = useState(false);
  const [, forceUpdate] = useState({});

  // Function to check if trade modal is open - synchronous check
  const checkTradeModalSync = () => {
    if (typeof window === 'undefined' || pathname !== '/home') return false;
    
    // Check for backdrop with all required classes
    const allDivs = Array.from(document.querySelectorAll('div'));
    const modalBackdrop = allDivs.find((el) => {
      const classList = Array.from(el.classList);
      return classList.includes('fixed') && 
             classList.includes('inset-0') && 
             classList.includes('z-50') && 
             classList.includes('backdrop-blur-sm');
    });

    // Also check for "Amount (USDC)" text
    const hasAmountLabel = document.body.textContent?.includes('Amount (USDC)') || false;

    return !!modalBackdrop || hasAmountLabel;
  };

  // Use layout effect for synchronous updates
  useLayoutEffect(() => {
    if (pathname !== '/home') {
      setIsTradeModalOpen(false);
      return;
    }

    const checkAndUpdate = () => {
      const isOpen = checkTradeModalSync();
      if (isOpen !== isTradeModalOpen) {
        setIsTradeModalOpen(isOpen);
      }
    };

    // Check immediately
    checkAndUpdate();
    
    // Check on mutations
    const observer = new MutationObserver(() => {
      checkAndUpdate();
      forceUpdate({}); // Force re-render
    });
    observer.observe(document.body, { 
      childList: true, 
      subtree: true, 
      attributes: true, 
      attributeFilter: ['class'] 
    });

    // Check on interval (every 16ms for 60fps)
    const interval = setInterval(() => {
      checkAndUpdate();
      forceUpdate({});
    }, 16);

    return () => {
      observer.disconnect();
      clearInterval(interval);
    };
  }, [pathname, isTradeModalOpen]);

  // Hide navbar on the login page
  if (!ready || pathname === '/') {
    return null;
  }

  // Check synchronously in render for immediate hiding
  const tradeModalOpenNow = pathname === '/home' ? checkTradeModalSync() : false;
  const shouldHide = pathname === '/home' && (isLoginModalOpen || isTradeModalOpen || tradeModalOpenNow);

  const isActive = (path: string) => pathname === path;

  // Get user avatar - use direct user properties (same as Profile.tsx)
  const getUserAvatar = () => {
    if (!user) return null;
    //@ts-ignore 
    return normalizeTwitterAvatarUrl(user.twitter?.profilePictureUrl) || user.google?.picture || null;
  };

  const avatar = getUserAvatar();

  return (
    <div className={`fixed bottom-6 left-0 right-0 z-40 md:hidden flex justify-center safe-area-bottom transition-opacity duration-200 ${shouldHide ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
      <nav className="flex items-center px-4 gap-2 py-3  bg-[var(--background)] border-2 border-[var(--border-color)] rounded-full shadow-xl">
        {/* Home Link */}
        <Link
          href="/home"
          className={`p-3 rounded-full transition-all duration-200 ${
            isActive('/home')
              ? 'bg-[var(--text-primary)] text-[var(--background)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
            />
          </svg>
        </Link>

        {/* Social Feed Link */}
        <Link
          href="/social"
          className={`p-3 rounded-full transition-all duration-200 ${
            isActive('/social')
              ? 'bg-[var(--text-primary)] text-[var(--background)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
            />
          </svg>
        </Link>

        {/* Jupiter Prediction Link */}
        <Link
          href="/jupiter"
          className={`p-3 rounded-full transition-all duration-200 ${
            pathname === '/jupiter' || pathname.startsWith('/jupiter/')
              ? 'bg-[var(--text-primary)] text-[var(--background)]'
              : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)]'
          }`}
          title="Jupiter Prediction"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"
            />
          </svg>
        </Link>

        {/* Profile Link */}
        <Link
          href="/profile"
          className={`p-2 rounded-full transition-all duration-200 ${
            authenticated && avatar
              ? ''
              : isActive('/profile')
                ? 'bg-[var(--text-primary)] text-[var(--background)] p-3'
                : 'text-[var(--text-tertiary)] hover:text-[var(--text-primary)] p-3'
          }`}
        >
          {authenticated && avatar ? (
            <img 
              src={avatar} 
              alt="Profile" 
              className="w-8 h-8 rounded-full object-cover"
            />
          ) : (
            <svg
              className="w-6 h-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
              />
            </svg>
          )}
        </Link>
      </nav>
    </div>
  );
}
