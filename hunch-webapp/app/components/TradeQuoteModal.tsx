'use client';

import { useState, useEffect, useRef } from 'react';
import { Market } from '../lib/api';
import { formatMarketTitle } from '../lib/marketUtils';

interface TradeQuoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (quote: string) => void;
  tradeData: {
    market: Market;
    side: 'yes' | 'no';
    budgetUsdc: string; // user-entered budget in USDC (UI)
    estimatedSpendUsdc?: string; // from quote inAmount (may be < budget)
    estimatedTokens?: string; // from quote outAmount
    entryPrice?: string; // implied quote price (spent/tokens)
  };
  isSubmitting?: boolean;
}

export default function TradeQuoteModal({
  isOpen,
  onClose,
  onSubmit,
  tradeData,
  isSubmitting = false,
}: TradeQuoteModalProps) {
  const [quote, setQuote] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const maxChars = 280;

  // Auto-focus textarea when modal opens
  useEffect(() => {
    if (isOpen && textareaRef.current) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [isOpen]);

  // Reset quote when modal closes
  useEffect(() => {
    if (!isOpen) {
      setQuote('');
    }
  }, [isOpen]);

  const handleSubmit = () => {
    onSubmit(quote.trim());
  };

  const handleSkip = () => {
    onSubmit('');
  };

  const remainingChars = maxChars - quote.length;
  const isOverLimit = remainingChars < 0;

  if (!isOpen) return null;

  const displayTitle = formatMarketTitle(
    tradeData.market.title || 'Untitled Market',
    tradeData.market.ticker
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 animate-fadeIn">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
        onClick={!isSubmitting ? onClose : undefined}
      />

      {/* Modal */}
      <div className="relative bg-gradient-to-br from-gray-900 via-gray-900 to-gray-800 border-2 border-white/30 rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden animate-scaleIn">
        {/* Gradient Border Effect */}
        <div className="absolute inset-0 bg-gradient-to-br from-white/20 via-gray-400/20 to-transparent pointer-events-none" />

        {/* Content */}
        <div className="relative p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-white mb-1 flex items-center gap-2">
                <span className="text-2xl">💭</span>
                Trade Placed Successfully!
              </h2>
              <p className="text-sm text-gray-400">
                Share your thoughts with your followers (optional)
              </p>
            </div>
            <button
              onClick={onClose}
              disabled={isSubmitting}
              className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all disabled:opacity-50"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          </div>

          {/* Trade Summary */}
          <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Market</span>
              <span className="text-sm font-medium text-white text-right max-w-[60%] truncate">
                {displayTitle}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Position</span>
              <span
                className={`text-sm font-bold ${
                  tradeData.side === 'yes' ? 'text-white' : 'text-pink-400'
                }`}
              >
                {tradeData.side.toUpperCase()}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-400">Budget</span>
              <span className="text-sm font-medium text-white">
                ${tradeData.budgetUsdc} USDC
              </span>
            </div>
            {tradeData.estimatedSpendUsdc && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Estimated spend</span>
                <span className="text-sm font-medium text-white">
                  ${tradeData.estimatedSpendUsdc} USDC
                </span>
              </div>
            )}
            {tradeData.estimatedTokens && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Estimated tokens</span>
                <span className="text-sm font-medium text-white">
                  {tradeData.estimatedTokens}
                </span>
              </div>
            )}
            {tradeData.entryPrice && (
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-400">Entry price (quote)</span>
                <span className="text-sm font-medium text-white">
                  {tradeData.entryPrice}
                </span>
              </div>
            )}
          </div>

          {/* Quote Input */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-300">
              Your Prediction or Insight
            </label>
            <textarea
              ref={textareaRef}
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              placeholder="Share why you made this trade... (optional)"
              disabled={isSubmitting}
              className={`w-full px-4 py-3 border rounded-xl bg-gray-800/50 text-white placeholder-gray-500 focus:ring-2 focus:ring-white focus:border-transparent disabled:opacity-50 transition-all resize-none ${
                isOverLimit
                  ? 'border-red-500 focus:ring-red-500'
                  : 'border-gray-700'
              }`}
              rows={4}
              maxLength={maxChars + 50} // Allow typing a bit over to show error
            />
            <div className="flex items-center justify-between text-xs">
              <span className="text-gray-500">
                {quote.length === 0
                  ? 'Add a quote to share with your followers'
                  : 'Your followers will see this in their feed'}
              </span>
              <span
                className={`font-medium ${
                  isOverLimit
                    ? 'text-red-400'
                    : remainingChars < 20
                    ? 'text-yellow-400'
                    : 'text-gray-500'
                }`}
              >
                {remainingChars} / {maxChars}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSkip}
              disabled={isSubmitting}
              className="flex-1 px-4 py-3 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-xl font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Skip
            </button>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting || isOverLimit || quote.trim().length === 0}
              className="flex-1 px-4 py-3 bg-gradient-to-r from-white to-gray-500 hover:from-white hover:to-gray-400 text-white rounded-xl font-semibold transition-all disabled:from-gray-600 disabled:to-gray-600 disabled:cursor-not-allowed shadow-lg shadow-white/25"
            >
              {isSubmitting ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Sharing...
                </span>
              ) : (
                'Share Trade'
              )}
            </button>
          </div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-gray-400/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0.95);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}

