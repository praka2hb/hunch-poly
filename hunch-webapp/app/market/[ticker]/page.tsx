'use client';

import { useEffect, useState, lazy, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { fetchMarkets, Market } from '@/app/lib/api';
import { parseMarketTicker, formatMarketTitle } from '@/app/lib/marketUtils';

// Lazy load heavy components
const TradeMarket = lazy(() => import('@/app/components/TradeMarket'));
const ShareBlink = lazy(() => import('@/app/components/ShareBlink'));

export default function MarketPage() {
  const params = useParams();
  const ticker = params?.ticker as string;
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadMarket = async () => {
      if (!ticker) return;

      try {
        setLoading(true);
        setError(null);
        const markets = await fetchMarkets(200);
        const foundMarket = markets.find((m) => m.ticker === decodeURIComponent(ticker));

        if (!foundMarket) {
          setError(`Market with ticker "${ticker}" not found`);
        } else {
          setMarket(foundMarket);
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load market');
        console.error('Error loading market:', err);
      } finally {
        setLoading(false);
      }
    };

    loadMarket();
  }, [ticker]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0D0D0D]">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
            <div className="space-y-4">
              <div className="h-8 bg-gray-800 rounded-lg animate-pulse" />
              <div className="h-4 bg-gray-800 rounded-lg animate-pulse w-3/4" />
              <div className="h-4 bg-gray-800 rounded-lg animate-pulse w-1/2" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error || !market) {
    return (
      <div className="min-h-screen bg-[#0D0D0D]">
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
          <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
            <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
              <p className="text-red-400">Error: {error || 'Market not found'}</p>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const dateInfo = parseMarketTicker(market.ticker);
  const displayTitle = formatMarketTitle(market.title || 'Untitled Market', market.ticker);

  return (
    <div className="min-h-screen bg-[#0D0D0D]">
      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gray-900/50 backdrop-blur-sm border border-gray-800/50 rounded-2xl p-6">
          <div className="flex justify-between items-start mb-4">
            <div className="flex-1 pr-4">
              <h1 className="text-2xl font-bold text-white mb-2">
                {displayTitle}
              </h1>
              {dateInfo.formattedDate && (
                <p className="text-sm text-white mb-2 flex items-center gap-1">
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

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 text-sm">
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
                <span className="font-mono text-xs text-white break-all">
                  {market.yesMint}
                </span>
              </div>
            )}
          </div>

          {market.status === 'active' && (
            <div className="mt-6 pt-6 border-t border-gray-800 space-y-4">
              <Suspense fallback={
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
                </div>
              }>
                <TradeMarket market={market} />
                <ShareBlink market={market} />
              </Suspense>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

