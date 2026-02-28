'use client';

import { useState, useEffect } from 'react';
import { fetchEventDetails, EventDetails, Market } from '../lib/api';
import TradeMarket from './TradeMarket';
import ShareBlink from './ShareBlink';
import { parseMarketTicker, formatMarketTitle } from '../lib/marketUtils';

interface EventDetailsModalProps {
  eventTicker: string;
  onClose: () => void;
}

export default function EventDetailsModal({ eventTicker, onClose }: EventDetailsModalProps) {
  const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadEventDetails = async () => {
      try {
        setLoading(true);
        setError(null);
        const details = await fetchEventDetails(eventTicker);
        setEventDetails(details);
      } catch (err: any) {
        setError(err.message || 'Failed to load event details');
        console.error('Error loading event details:', err);
      } finally {
        setLoading(false);
      }
    };

    loadEventDetails();
  }, [eventTicker]);

  const getMintAddress = (market: Market, type: 'yes' | 'no'): string | undefined => {
    if (market.accounts) {
      // Handle accounts as an object with string keys (like { "EPjF...": { yesMint: "...", ... } })
      if (typeof market.accounts === 'object' && !Array.isArray(market.accounts)) {
        // Check if accounts has direct yesMint/noMint (simple structure)
        if ('yesMint' in market.accounts && typeof (market.accounts as any).yesMint === 'string') {
          return type === 'yes' ? (market.accounts as any).yesMint : (market.accounts as any).noMint;
        }
        
        // Otherwise, iterate through account keys to find mints
        const accountKeys = Object.keys(market.accounts);
        for (const key of accountKeys) {
          const account = (market.accounts as any)[key];
          if (account && typeof account === 'object') {
            const mint = type === 'yes' ? account.yesMint : account.noMint;
            if (mint && typeof mint === 'string') {
              return mint;
            }
          }
        }
      }
    }
    return type === 'yes' ? market.yesMint : market.noMint;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-6 border-b border-gray-800">
          <h2 className="text-2xl font-bold text-white">
            Event Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-xl transition-all"
          >
            <svg
              className="w-6 h-6"
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

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
          {loading ? (
            <div className="space-y-4">
              <div className="h-8 bg-gray-800 rounded-lg animate-pulse" />
              <div className="h-4 bg-gray-800 rounded-lg animate-pulse w-3/4" />
              <div className="h-4 bg-gray-800 rounded-lg animate-pulse w-1/2" />
            </div>
          ) : error ? (
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400">Error: {error}</p>
            </div>
          ) : eventDetails ? (
            <div className="space-y-6">
              {/* Event Info */}
              <div className="bg-gray-800/30 border border-gray-800 rounded-xl p-6">
                <p className="text-sm font-mono text-gray-500 mb-2">
                  {eventDetails.ticker}
                </p>
                <h3 className="text-2xl font-bold text-white mb-2">
                  {eventDetails.title}
                </h3>
                {eventDetails.subtitle && (
                  <p className="text-gray-400">
                    {eventDetails.subtitle}
                  </p>
                )}
              </div>

              {/* Markets */}
              {eventDetails.markets && eventDetails.markets.length > 0 ? (
                <div>
                  <div className="flex items-center justify-between mb-4">
                    <h4 className="text-xl font-semibold text-white">
                      Related Markets
                    </h4>
                    <span className="px-3 py-1 bg-white/20 text-white text-sm font-medium rounded-lg border border-white/30">
                      {eventDetails.markets.filter((m: Market) => 
                        m.status !== 'finalized' && 
                        m.status !== 'resolved' && 
                        m.status !== 'closed'
                      ).length} active
                    </span>
                  </div>
                  <div className="space-y-4">
                    {eventDetails.markets
                      .filter((market: Market) => 
                        market.status !== 'finalized' &&
                        market.status !== 'resolved' &&
                        market.status !== 'closed'
                      )
                      .map((market: Market, index: number) => {
                      const yesMint = getMintAddress(market, 'yes');
                      const noMint = getMintAddress(market, 'no');
                      const dateInfo = parseMarketTicker(market.ticker);
                      const displayTitle = formatMarketTitle(market.title || 'Untitled Market', market.ticker);

                      return (
                        <div
                          key={market.ticker || index}
                          className="p-5 bg-gray-800/30 border border-gray-800 rounded-xl hover:border-gray-700 transition-all"
                        >
                          <div className="flex justify-between items-start mb-4">
                            <div className="flex-1 pr-4">
                              <h5 className="font-semibold text-white mb-2">
                                {displayTitle}
                              </h5>
                              {dateInfo.formattedDate && (
                                <p className="text-xs text-white mb-2 flex items-center gap-1">
                                  <span>📅</span> {dateInfo.formattedDate}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 font-mono">
                                {market.ticker}
                              </p>
                            </div>
                            <span
                              className={`px-3 py-1 text-xs font-semibold rounded-lg shrink-0 ${
                                market.status === 'active'
                                  ? 'bg-green-500/20 text-green-400 border border-green-500/30'
                                  : market.status === 'resolved'
                                  ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                  : 'bg-gray-700 text-gray-400 border border-gray-600'
                              }`}
                            >
                              {market.status || 'unknown'}
                            </span>
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm mb-4">
                            {yesMint && (
                              <div className="bg-gray-800/50 rounded-lg p-3">
                                <span className="text-gray-500 text-xs block mb-1">Yes Mint</span>
                                <span className="font-mono text-xs text-white break-all">
                                  {yesMint}
                                </span>
                              </div>
                            )}
                            {noMint && (
                              <div className="bg-gray-800/50 rounded-lg p-3">
                                <span className="text-gray-500 text-xs block mb-1">No Mint</span>
                                <span className="font-mono text-xs text-white break-all">
                                  {noMint}
                                </span>
                              </div>
                            )}
                            {market.volume !== undefined && (
                              <div className="bg-gray-800/50 rounded-lg p-3">
                                <span className="text-gray-500 text-xs block mb-1">Volume</span>
                                <span className="font-semibold text-white">
                                  {market.volume.toLocaleString()}
                                </span>
                              </div>
                            )}
                          </div>
                          {/* Trading Component and Share Blink */}
                          {market.status === 'active' && (
                            <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
                              <TradeMarket market={market} />
                              <ShareBlink market={market} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="p-6 bg-gray-800/30 border border-gray-800 rounded-xl text-center">
                  <div className="w-12 h-12 mx-auto mb-3 bg-gray-800 rounded-xl flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                  </div>
                  <p className="text-gray-500">
                    No markets found for this event.
                  </p>
                </div>
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-800">
          <button
            onClick={onClose}
            className="w-full px-4 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl transition-all font-semibold border border-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
