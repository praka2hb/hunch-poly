'use client';

import { Market } from '../lib/api';
import { createDialToDeveloperLink } from '../lib/blinkUtils';

interface ShareBlinkProps {
  market: Market;
}

export default function ShareBlink({ market }: ShareBlinkProps) {
  const developerLink = createDialToDeveloperLink(market.ticker);

  const handleClick = () => {
    window.open(developerLink, '_blank', 'noopener,noreferrer');
  };

  return (
    <button
      onClick={handleClick}
      className="w-full px-4 py-2 bg-[var(--surface-hover)] hover:bg-[var(--input-bg)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] rounded-lg transition-all duration-200 text-sm font-medium border border-[var(--border-color)] flex items-center justify-center gap-2"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
      </svg>
      Share Blink
    </button>
  );
}
