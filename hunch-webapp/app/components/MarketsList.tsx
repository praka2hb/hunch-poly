'use client';

import { useState, useEffect } from 'react';
import { fetchMarkets, Market } from '../lib/api';
import TradeMarket from './TradeMarket';
import ShareBlink from './ShareBlink';
import { parseMarketTicker, formatMarketTitle } from '../lib/marketUtils';

export default function MarketsList() {
  const [markets, setMarkets] = useState<Market[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);

  useEffect(() => {
    const loadMarkets = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchMarkets(50);
        // Filter out finalized/resolved/closed markets
        const activeMarkets = data.filter(
          (market) =>
            market.status !== 'finalized' &&
            market.status !== 'resolved' &&
            market.status !== 'closed'
        );
        setMarkets(activeMarkets);
      } catch (err: any) {
        setError(err.message || 'Failed to load markets');
        console.error('Error loading markets:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMarkets();
  }, []);

  if (loading) {
    return (
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-6 text-white">
          Markets
        </h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-24 bg-gray-800/50 rounded-xl animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-6 text-white">
          Markets
        </h2>
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <p className="text-red-400">Error: {error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">
          Markets
        </h2>
        <span className="px-3 py-1 bg-white/20 text-white text-sm font-medium rounded-lg border border-white/30">
          {markets.length} active
        </span>
      </div>
      <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
        {markets.length === 0 ? (
          <div className="text-center py-12">
            <div className="w-16 h-16 mx-auto mb-4 bg-gray-800 rounded-2xl flex items-center justify-center">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-gray-500">No markets found</p>
          </div>
        ) : (
          markets.map((market, index) => {
            const dateInfo = parseMarketTicker(market.ticker);
            const displayTitle = formatMarketTitle(market.title || 'Untitled Market', market.ticker);
            
            return (
            <div
              key={market.ticker || index}
              className="p-5 bg-gray-800/30 border border-gray-800 rounded-xl hover:border-gray-700 transition-all duration-200"
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex-1 pr-4">
                  <h3 className="font-semibold text-white mb-2 leading-tight">
                    {displayTitle}
                  </h3>
                  {dateInfo.formattedDate && (
                    <p className="text-xs text-white mb-2 flex items-center gap-1">
                      <span>📅</span> {dateInfo.formattedDate}
                    </p>
                  )}
                  <p className="text-xs text-gray-500 font-mono truncate">
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
              <div className="grid grid-cols-2 gap-4 mt-4 text-sm">
                {market.volume !== undefined && (
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <span className="text-gray-500 text-xs block mb-1">Volume</span>
                    <span className="font-semibold text-white">
                      {market.volume.toLocaleString()}
                    </span>
                  </div>
                )}
                {market.yesMint && (
                  <div className="bg-gray-800/50 rounded-lg p-3">
                    <span className="text-gray-500 text-xs block mb-1">Yes Mint</span>
                    <span className="font-mono text-xs text-white">
                      {market.yesMint.slice(0, 8)}...
                    </span>
                  </div>
                )}
              </div>
              {market.status === 'active' && (
                <div className="mt-4 pt-4 border-t border-gray-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setSelectedMarket(selectedMarket?.ticker === market.ticker ? null : market)}
                      className="px-4 py-2 bg-gradient-to-r from-white to-gray-500 hover:from-white hover:to-gray-400 text-white rounded-xl transition-all duration-200 text-sm font-semibold"
                    >
                      {selectedMarket?.ticker === market.ticker ? 'Hide Trading' : 'Trade'}
                    </button>
                    <ShareBlink market={market} />
                  </div>
                  {selectedMarket?.ticker === market.ticker && (
                    <div className="mt-4">
                      <TradeMarket market={market} />
                    </div>
                  )}
                </div>
              )}
            </div>
            );
          })
        )}
      </div>
    </div>
  );
}
