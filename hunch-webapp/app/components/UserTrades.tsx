'use client';

import { useState, useEffect } from 'react';
import { usePrivy, useWallets } from '@privy-io/react-auth';
import { Connection, PublicKey } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from '@solana/spl-token';
import type { Market } from '../lib/api';
import { formatMarketTitle } from '../lib/marketUtils';

interface Trade {
  id: string;
  userId: string;
  marketTicker: string;
  side: string;
  amount: string;
  transactionSig: string;
  quote: string | null;
  entryPrice: number | null;
  createdAt: string;
  user: {
    id: string;
    displayName: string | null;
    avatarUrl: string | null;
    walletAddress: string;
  };
}

interface Position {
  mint: string;
  balance: number;
  decimals: number;
  position: 'YES' | 'NO' | 'UNKNOWN';
  market: Market | null;
}

interface UserTradesProps {
  userId: string;
  walletAddress?: string | null;
}

export default function UserTrades({ userId, walletAddress }: UserTradesProps) {
  const { ready, authenticated } = usePrivy();
  const [activeTab, setActiveTab] = useState<'active' | 'previous'>('active');
  const [trades, setTrades] = useState<Trade[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [markets, setMarkets] = useState<Map<string, Market>>(new Map());
  const [loading, setLoading] = useState(true);
  const [positionsLoading, setPositionsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  // Load trades and positions in parallel
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      
      try {
        // Start both operations in parallel
        const tradesPromise = loadTrades();
        const positionsPromise = (ready && authenticated && walletAddress) 
          ? loadPositions() 
          : Promise.resolve();
        
        await Promise.all([tradesPromise, positionsPromise]);
      } catch (err) {
        console.error('Error loading data:', err);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [userId, ready, authenticated, walletAddress]);

  useEffect(() => {
    if (trades.length > 0 || positions.length > 0) {
      loadMarkets();
    }
  }, [trades, positions]);

  const loadTrades = async () => {
    try {
      setError(null);
      const response = await fetch(`/api/trades?userId=${userId}&limit=100`);
      if (response.ok) {
        const data = await response.json();
        setTrades(data);
      } else {
        setError('Failed to load trades');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load trades');
      console.error('Error loading trades:', err);
    }
  };

  const loadPositions = async () => {
    if (!walletAddress) return;

    setPositionsLoading(true);
    try {
      const publicKey = new PublicKey(walletAddress);
      
      // Fetch token accounts from both programs
      const [tokenAccounts2022, tokenAccountsLegacy] = await Promise.all([
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_2022_PROGRAM_ID,
        }).catch(() => ({ value: [] })),
        connection.getParsedTokenAccountsByOwner(publicKey, {
          programId: TOKEN_PROGRAM_ID,
        }).catch(() => ({ value: [] })),
      ]);

      const allTokenAccounts = [
        ...tokenAccounts2022.value,
        ...tokenAccountsLegacy.value,
      ];

      const userTokens = allTokenAccounts
        .map(({ account }) => {
          const info = account.data.parsed.info;
          return {
            mint: info.mint,
            balance: info.tokenAmount.uiAmount || 0,
            decimals: info.tokenAmount.decimals,
            rawBalance: info.tokenAmount.amount,
          };
        })
        .filter((token) => token.balance > 0);

      if (userTokens.length === 0) {
        setPositions([]);
        setPositionsLoading(false);
        return;
      }

      // Filter for prediction market tokens
      const allMintAddresses = userTokens.map((token) => token.mint);
      
      // Call API to filter outcome mints
      const filterResponse = await fetch('/api/markets/filter-outcome-mints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: allMintAddresses }),
      });
      
      if (!filterResponse.ok) {
        throw new Error('Failed to filter outcome mints');
      }
      
      const { outcomeMints } = await filterResponse.json();

      if (outcomeMints.length === 0) {
        setPositions([]);
        setPositionsLoading(false);
        return;
      }

      // Fetch market details via API
      const batchResponse = await fetch('/api/markets/batch-by-mint', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mints: outcomeMints }),
      });

      if (!batchResponse.ok) {
        throw new Error('Failed to fetch markets batch');
      }

      const { markets: marketsData } = await batchResponse.json() as { markets: Market[] };

      // Create market map
      const marketsByMint = new Map<string, Market>();
      marketsData.forEach((market) => {
        if (market.accounts) {
          Object.values(market.accounts).forEach((account: any) => {
            if (account.yesMint) marketsByMint.set(account.yesMint, market);
            if (account.noMint) marketsByMint.set(account.noMint, market);
            if (account.marketLedger) marketsByMint.set(account.marketLedger, market);
          });
        }
        if (market.yesMint) marketsByMint.set(market.yesMint, market);
        if (market.noMint) marketsByMint.set(market.noMint, market);
      });

      // Map tokens to positions
      const userPositions: Position[] = userTokens
        .filter((token) => outcomeMints.includes(token.mint))
        .map<Position>((token) => {
          const marketData = marketsByMint.get(token.mint);
          if (!marketData) {
            return {
              mint: token.mint,
              balance: token.balance,
              decimals: token.decimals,
              position: 'UNKNOWN',
              market: null,
            };
          }

          const isYesToken = marketData.accounts
            ? Object.values(marketData.accounts).some(
                (account: any) => account.yesMint === token.mint
              )
            : marketData.yesMint === token.mint;

          const isNoToken = marketData.accounts
            ? Object.values(marketData.accounts).some(
                (account: any) => account.noMint === token.mint
              )
            : marketData.noMint === token.mint;

          const position: Position['position'] =
            isYesToken ? 'YES' : isNoToken ? 'NO' : 'UNKNOWN';

          return {
            mint: token.mint,
            balance: token.balance,
            decimals: token.decimals,
            position,
            market: marketData,
          };
        })
        .filter((pos) => pos.market && pos.market.status === 'active'); // Only active positions

      setPositions(userPositions);
    } catch (err: any) {
      console.error('Error loading positions:', err);
    } finally {
      setPositionsLoading(false);
    }
  };

  const loadMarkets = async () => {
    try {
      // Get unique market tickers from trades and positions
      const tradeTickers = Array.from(new Set(trades.map(t => t.marketTicker)));
      const positionTickers = Array.from(new Set(
        positions.map(p => p.market?.ticker).filter(Boolean) as string[]
      ));
      const allTickers = Array.from(new Set([...tradeTickers, ...positionTickers]));
      
      if (allTickers.length === 0) return;
      
      // Use batch endpoint to fetch only needed markets
      const response = await fetch('/api/markets/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tickers: allTickers }),
      });
      
      if (response.ok) {
        const data = await response.json();
        const marketMap = new Map<string, Market>();
        
        // Convert object to Map
        Object.entries(data.markets).forEach(([ticker, market]) => {
          marketMap.set(ticker, market as Market);
        });
        
        // Also add markets from positions
        positions.forEach(pos => {
          if (pos.market && !marketMap.has(pos.market.ticker)) {
            marketMap.set(pos.market.ticker, pos.market);
          }
        });
        
        setMarkets(marketMap);
      }
    } catch (err) {
      console.error('Error loading markets:', err);
    }
  };

  const isMarketActive = (marketTicker: string): boolean => {
    const market = markets.get(marketTicker);
    if (!market) return false; // If market not found, assume inactive
    
    return market.status === 'active';
  };

  const activeTrades = trades.filter(trade => isMarketActive(trade.marketTicker));
  const previousTrades = trades.filter(trade => !isMarketActive(trade.marketTicker));
  
  // Combine active trades with positions for the active tab
  const activeItems = activeTab === 'active' 
    ? [
        ...activeTrades.map(trade => ({ type: 'trade' as const, data: trade })),
        ...positions.map(pos => ({ type: 'position' as const, data: pos }))
      ]
    : previousTrades.map(trade => ({ type: 'trade' as const, data: trade }));

  // Log active trades for debugging
  useEffect(() => {
    if (trades.length > 0 && markets.size > 0) {
      const active = trades.filter(trade => isMarketActive(trade.marketTicker));
      const previous = trades.filter(trade => !isMarketActive(trade.marketTicker));
      console.log('Active trades fetched:', {
        total: trades.length,
        active: active.length,
        previous: previous.length,
      });
    }
  }, [trades, markets]);

  // Compact date like 27/12/25
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = String(date.getFullYear()).slice(-2);
    return `${day}/${month}/${year}`;
  };

  const formatAmount = (amount: string) => {
    // Amount is stored in smallest units (USDC has 6 decimals)
    const raw = parseFloat(amount);
    if (Number.isNaN(raw)) return '$0';
    const num = raw > 10_000 ? raw / 1_000_000 : raw; // Heuristic: if huge, assume micro-units
    if (Number.isNaN(num)) return '$0';
    if (num >= 1000000) {
      return `$${(num / 1000000).toFixed(2)}M`;
    }
    if (num >= 1000) {
      return `$${(num / 1000).toFixed(2)}K`;
    }
    return `$${num.toFixed(0)}`;
  };

  const formatCurrency = (value: number) => {
    if (!Number.isFinite(value)) return '$0';
    const abs = Math.abs(value);
    const decimals = abs < 1000 ? 2 : 0;
    return `${value < 0 ? '-' : ''}$${Math.abs(value).toLocaleString('en-US', {
      maximumFractionDigits: decimals,
      minimumFractionDigits: decimals,
    })}`;
  };

  const getWagerForPosition = (position: Position) => {
    const ticker = position.market?.ticker;
    if (!ticker) return 0;
    const side = position.position.toLowerCase();
    return trades
      .filter(
        (trade) =>
          trade.marketTicker === ticker &&
          trade.side.toLowerCase() === side
      )
      .reduce((sum, trade) => {
        const raw = parseFloat(trade.amount);
        if (Number.isNaN(raw)) return sum;
        const normalized = raw > 10_000 ? raw / 1_000_000 : raw; // If very large, treat as micro-units
        return sum + normalized;
      }, 0);
  };

  const getCurrentPriceForPosition = (position: Position) => {
    const market = position.market;
    if (!market) return null;
    const sideLower = position.position.toLowerCase();
    const priceStr =
      sideLower === 'yes'
        ? market.yesBid ?? market.yesAsk
        : market.noBid ?? market.noAsk;
    if (!priceStr) return null;
    const price = parseFloat(priceStr);
    return Number.isNaN(price) ? null : price;
  };

  const getCurrentValue = (position: Position) => {
    const price = getCurrentPriceForPosition(position);
    if (!price) return null;
    return position.balance * price;
  };

  const getCardGradient = () =>
    'linear-gradient(145deg, rgba(19,52,35,0.95), rgba(6,22,17,0.96) 40%, rgba(3,10,8,0.98))';

  const getSideStyles = (side: string) => {
    const isYes = side.toLowerCase() === 'yes';
    return {
      text: isYes ? 'YES' : side.toUpperCase(),
      className: isYes
        ? 'text-[#42ff8e]'
        : 'text-[#ff6fa3]',
    };
  };

  const renderBadge = (label: string) => (
    <span className="inline-flex items-center gap-1 px-3 py-1 text-xs font-semibold rounded-full bg-white/8 text-white/80 backdrop-blur-sm">
      {label}
    </span>
  );

  if (loading || positionsLoading) {
    return (
      <div className="bg-(--surface)/50 backdrop-blur-sm border border-border rounded-2xl p-6">
        <div className="flex items-center justify-center py-8">
          <div className="w-8 h-8 border-4 border-white border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="backdrop-blur-sm border rounded-2xl p-6">
        <p className="text-red-400 text-center py-4">{error}</p>
      </div>
    );
  }

  return (
    <div className="backdrop-blur-sm rounded-2xl p-6">
      
      {/* Tabs */}
     
      <div className="flex gap-2 mb-6 border-b border-border">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 md:px-6 md:py-3 text-xl md:text-2xl font-bold transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'active'
              ? 'border-text-primary text-text-primary'
              : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          ACTIVE
          {(activeTrades.length > 0 || positions.length > 0) && (
            <span className={`text-xs md:text-sm px-2 py-0.5 md:px-3 md:py-1 rounded-full ${
              activeTab === 'active'
                ? 'bg-white/20 text-white'
                : 'bg-surface-hover text-text-tertiary'
            }`}>
              {activeTrades.length + positions.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('previous')}
          className={`px-4 py-2 md:px-6 md:py-3 font-bold text-xl md:text-2xl transition-colors border-b-2 flex items-center gap-2 ${
            activeTab === 'previous'
              ? 'border-red-400 text-red-400'
              : 'border-transparent text-text-tertiary hover:text-text-secondary'
          }`}
        >
          PREVIOUS
          {previousTrades.length > 0 && (
            <span className={`text-xs md:text-sm px-2 py-0.5 md:px-3 md:py-1 rounded-full ${
              activeTab === 'previous'
                ? 'bg-red-500/20 text-red-400'
                : 'bg-surface-hover text-text-tertiary'
            }`}>
              {previousTrades.length}
            </span>
          )}
        </button>
      </div>

      {/* Trades and Positions List */}
      {activeItems.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-text-tertiary">
            No {activeTab === 'active' ? 'active' : 'previous'} trades found
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {activeItems.map((item) => {
            if (item.type === 'trade') {
              const trade = item.data;
              const market = markets.get(trade.marketTicker);
              const marketTitle = market?.title
                ? formatMarketTitle(market.title, trade.marketTicker)
                : trade.marketTicker;
              const side = getSideStyles(trade.side);
              const stake = formatAmount(trade.amount);
              
              // Entry Price Logic (with fallback to current market price)
              const entryPrice = trade.entryPrice 
                ? parseFloat(trade.entryPrice.toString())
                : (trade.side.toLowerCase() === 'yes' 
                    ? (market?.yesBid ? parseFloat(market.yesBid) : null)
                    : (market?.noBid ? parseFloat(market.noBid) : null));

              return (
                <div
                  key={trade.id}
                  className="relative overflow-hidden rounded-[28px] border border-[#0f3d2a] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
                  style={{ background: getCardGradient() }}
                >
                  <div className="absolute inset-0 opacity-40 blur-2xl" />
                  <div className="relative grid grid-cols-[1fr_auto] gap-4 p-5 sm:p-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="text-4xl sm:text-5xl font-bold text-[#7cffb1] font-number tracking-tight">
                          {stake}
                        </div>
                        <div className="text-4xl sm:text-5xl font-black leading-none text-right">
                          <span className={`${side.className} drop-shadow`}>{side.text}</span>
                        </div>
                      </div>

                      {entryPrice !== null && (
                        <div className="text-lg text-[#c2c9c6] font-medium -mt-1 mb-2">
                          @ {entryPrice.toFixed(2)}
                        </div>
                      )}

                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <h4 className="text-white text-2xl sm:text-3xl font-semibold leading-tight">
                            {marketTitle}
                          </h4>
                          <p className="text-[#c2c9c6] italic mt-1 text-lg">
                            {market?.subtitle
                              ? market.subtitle
                              : `on ${marketTitle}`}
                          </p>
                        </div>
                        {market?.imageUrl && (
                          <img
                            src={market.imageUrl}
                            alt={marketTitle}
                            className="w-14 h-14 rounded-xl border border-white/10 object-cover shadow-md"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between items-end text-right min-w-[110px]">
                      <div className="flex gap-2">{renderBadge(market?.status ?? 'pending')}</div>
                      <div className="text-4xl sm:text-5xl font-black text-[#7cffb1] leading-none">
                        +{Math.max(1, Math.round(parseFloat(trade.amount) / 1_000_000)) || 1}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-5 sm:px-6 pb-5 sm:pb-6">
                    <span className="text-sm sm:text-base font-semibold text-[#b7bcb8]">
                      {formatDate(trade.createdAt)}
                    </span>
                    <a
                      href={`https://solscan.io/tx/${trade.transactionSig}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm sm:text-base font-semibold text-[#7cffb1] hover:text-white transition-colors underline underline-offset-4"
                    >
                      View Tx
                    </a>
                  </div>
                </div>
              );
            } else {
              const position = item.data;
              const market = position.market;
              const marketTitle = market?.title
                ? formatMarketTitle(market.title, market.ticker)
                : market?.ticker || 'Unknown Market';
              const side = getSideStyles(position.position);
              const wagered = getWagerForPosition(position);
              const currentValue = getCurrentValue(position);
              const pnl = currentValue !== null ? currentValue - wagered : null;

              return (
                <div
                  key={position.mint}
                  className="relative overflow-hidden rounded-[28px] border border-[#0f3d2a] shadow-[0_12px_32px_rgba(0,0,0,0.45)]"
                  style={{ background: getCardGradient() }}
                >
                  <div className="absolute inset-0 opacity-40 blur-2xl" />
                  <div className="relative grid grid-cols-[1fr_auto] gap-4 p-5 sm:p-6">
                    <div className="flex flex-col gap-2">
                      <div className="flex items-start justify-between">
                        <div className="text-4xl sm:text-5xl font-bold text-[#7cffb1] font-number tracking-tight">
                          {position.balance.toLocaleString()}
                        </div>
                        <div className="text-4xl sm:text-5xl font-black leading-none text-right">
                          <span className={`${side.className} drop-shadow`}>{side.text}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <h4 className="text-white text-2xl sm:text-3xl font-semibold leading-tight">
                            {marketTitle}
                          </h4>
                          <p className="text-[#c2c9c6] italic mt-1 text-lg">
                            {market?.subtitle
                              ? market.subtitle
                              : market?.ticker
                                ? `on ${market.ticker}`
                                : 'Active position'}
                          </p>
                          <div className="flex flex-wrap items-center gap-3 text-sm text-[#c2c9c6] mt-2">
                            <span>
                              Wagered{' '}
                              <span className="text-white font-semibold">
                                {formatCurrency(wagered)}
                              </span>
                            </span>
                            {pnl !== null && (
                              <>
                                <span className="text-white/30">•</span>
                                <span className={`font-semibold ${pnl >= 0 ? 'text-[#7cffb1]' : 'text-[#ff6fa3]'}`}>
                                  {pnl >= 0 ? '+' : ''}
                                  {formatCurrency(pnl)}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                        {market?.imageUrl && (
                          <img
                            src={market.imageUrl}
                            alt={marketTitle}
                            className="w-14 h-14 rounded-xl border border-white/10 object-cover shadow-md"
                          />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-col justify-between items-end text-right min-w-[110px]">
                      <div className="flex gap-2">
                        {renderBadge(market?.status ?? 'active')}
                      </div>
                      <div className="text-4xl sm:text-5xl font-black text-[#7cffb1] leading-none">
                        +{Math.max(1, Math.round(position.balance)) || 1}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-5 sm:px-6 pb-5 sm:pb-6">
                    <span className="text-sm sm:text-base font-semibold text-[#b7bcb8]">
                      {market?.closeTime ? formatDate(new Date(market.closeTime * 1000).toISOString()) : '—'}
                    </span>
                    {market?.ticker && (
                      <span className="text-sm sm:text-base font-semibold text-[#7cffb1]">
                        {market.ticker}
                      </span>
                    )}
                  </div>
                </div>
              );
            }
          })}
        </div>
      )}
    </div>
  );
}
