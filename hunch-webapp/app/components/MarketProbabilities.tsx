'use client';

import { useState, useEffect } from 'react';
import { Market } from '../lib/api';
import { fetchMarketProbabilities, MarketProbabilities } from '../lib/probabilityUtils';

interface MarketProbabilitiesProps {
  market: Market;
}

export default function MarketProbabilitiesDisplay({ market }: MarketProbabilitiesProps) {
  const [probabilities, setProbabilities] = useState<MarketProbabilities>({
    yesProbability: null,
    noProbability: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    // Only fetch probabilities for active markets
    if (market.status !== 'active') {
      setProbabilities({
        yesProbability: null,
        noProbability: null,
        loading: false,
        error: null,
      });
      return;
    }

    const loadProbabilities = async () => {
      setProbabilities(prev => ({ ...prev, loading: true }));
      const result = await fetchMarketProbabilities(market);
      setProbabilities(result);
    };

    loadProbabilities();
  }, [market]);

  if (market.status !== 'active') {
    return null;
  }

  if (probabilities.loading) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <span className="text-gray-400">Loading probabilities...</span>
      </div>
    );
  }

  if (probabilities.error || (probabilities.yesProbability === null && probabilities.noProbability === null)) {
    return null; // Don't show anything if there's an error or no data
  }

  return (
    <div className="flex items-center gap-3 mb-3">
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">YES</span>
          <span className="text-sm font-semibold text-white">
            {probabilities.yesProbability !== null ? `${probabilities.yesProbability}%` : '--'}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-white/30 transition-all duration-300"
            style={{ width: `${probabilities.yesProbability || 0}%` }}
          />
        </div>
      </div>
      <div className="flex-1">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs text-gray-400">NO</span>
          <span className="text-sm font-semibold text-pink-400">
            {probabilities.noProbability !== null ? `${probabilities.noProbability}%` : '--'}
          </span>
        </div>
        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-pink-500/30 transition-all duration-300"
            style={{ width: `${probabilities.noProbability || 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

