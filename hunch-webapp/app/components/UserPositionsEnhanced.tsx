'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import PositionCard from './PositionCard';
import { useTheme } from './ThemeProvider';
import { useAppData } from '../contexts/AppDataContext';
import type { AggregatedPosition } from '../lib/positionService';

interface UserPositionsEnhancedProps {
  userId: string;
  allowActions?: boolean;
  walletAddress?: string | null;
}

/** On-chain positions (active tab) */
interface OnChainPositions {
  active: AggregatedPosition[];
  redeemable: AggregatedPosition[];
  closeable: AggregatedPosition[];
}

export default function UserPositionsEnhanced({ userId, allowActions = false, walletAddress: propWalletAddress }: UserPositionsEnhancedProps) {
  const { theme } = useTheme();
  const { positionsRefreshKey } = useAppData();
  const { user } = usePrivy();
  const [activeTab, setActiveTab] = useState<'active' | 'previous'>('active');

  // On-chain positions → Active tab
  const [onChainPositions, setOnChainPositions] = useState<OnChainPositions>({ active: [], redeemable: [], closeable: [] });
  // DB positions → Previous tab
  const [dbPrevious, setDbPrevious] = useState<AggregatedPosition[]>([]);

  const [loadingOnChain, setLoadingOnChain] = useState(true);
  const [loadingDb, setLoadingDb] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(propWalletAddress || null);

  // Extract wallet address from user (fallback if not provided as prop)
  useEffect(() => {
    if (propWalletAddress) {
      setWalletAddress(propWalletAddress);
      return;
    }

    if (!user) return;

    const solanaWallet = user.linkedAccounts?.find(
      (account) => account.type === 'wallet' &&
        'address' in account &&
        account.address &&
        typeof account.address === 'string' &&
        !account.address.startsWith('0x') &&
        account.address.length >= 32
    ) as any;

    if (solanaWallet?.address) {
      setWalletAddress(solanaWallet.address);
    }
  }, [user, propWalletAddress]);

  // ── Fetch on-chain positions (ACTIVE tab) ──────────────────────────
  useEffect(() => {
    if (!walletAddress) {
      setLoadingOnChain(false);
      return;
    }
    loadOnChainPositions();
  }, [walletAddress, positionsRefreshKey]);

  // ── Fetch DB previous positions (PREVIOUS tab) ────────────────────
  useEffect(() => {
    if (!userId) {
      setLoadingDb(false);
      return;
    }
    loadDbPrevious();
  }, [userId, positionsRefreshKey]);

  /** On-chain: active / redeemable / closeable  → shown in ACTIVE tab */
  const loadOnChainPositions = async () => {
    try {
      setLoadingOnChain(true);

      const res = await fetch(
        `/api/positions/onchain?walletAddress=${walletAddress}`,
        { cache: 'no-store' },
      );

      if (!res.ok) throw new Error('Failed to load on-chain positions');

      const data = await res.json();

      const toAggregated = (pos: any): AggregatedPosition => ({
        positionId: `onchain-${pos.mint}`,
        marketTicker: pos.marketTicker || 'UNKNOWN',
        eventTicker: pos.eventTicker,
        outcomeMint: pos.mint || null,
        side: pos.side,
        totalTokenAmount: pos.balance,
        totalUsdcAmount: pos.currentValue || 0,
        averageEntryPrice: pos.currentPrice || 0,
        currentPrice: pos.currentPrice,
        currentValue: pos.currentValue,
        profitLoss: null,
        profitLossPercentage: null,
        tradeCount: 0,
        market: pos.market,
        eventImageUrl: null,
        trades: [],
        avgEntryPrice: pos.currentPrice || 0,
        netQuantity: pos.balance,
        realizedPnL: 0,
        unrealizedPnL: null,
        totalPnL: null,
        totalCostBasis: 0,
        openedAt: new Date(),
        closedAt: null,
        positionStatus: 'OPEN' as const,
        ...(pos.tokenAccountAddress ? { tokenAccountAddress: pos.tokenAccountAddress } : {}),
        ...(pos.rawBalance ? { rawBalance: pos.rawBalance } : {}),
        ...(pos.category ? { category: pos.category } : {}),
        ...(pos.redemptionStatus ? { redemptionStatus: pos.redemptionStatus } : {}),
        ...(pos.isWinningSide !== undefined ? { isWinningSide: pos.isWinningSide } : {}),
        ...(pos.settlementMint ? { settlementMint: pos.settlementMint } : {}),
      });

      const active = (data.active || []).map(toAggregated);
      const redeemable = (data.redeemable || []).map(toAggregated);
      const closeable = (data.closeable || []).map(toAggregated);

      console.log(`[OnChain] ${active.length} active, ${redeemable.length} redeemable, ${closeable.length} closeable`);

      setOnChainPositions({ active, redeemable, closeable });
    } catch (err: any) {
      console.error('[OnChain] Error:', err);
      // Don't overwrite error if DB succeeded; only set if both fail
      setError((prev) => prev || err.message);
    } finally {
      setLoadingOnChain(false);
    }
  };

  /** DB: previous/closed positions → shown in PREVIOUS tab */
  const loadDbPrevious = async () => {
    try {
      setLoadingDb(true);

      const res = await fetch(
        `/api/positions?userId=${userId}`,
        { cache: 'no-store' },
      );

      if (!res.ok) throw new Error('Failed to load DB positions');

      const data = await res.json();
      const previous: AggregatedPosition[] = data.positions?.previous || [];

      console.log(`[DB] ${previous.length} previous positions`);
      setDbPrevious(previous);
    } catch (err: any) {
      console.error('[DB] Error:', err);
      setError((prev) => prev || err.message);
    } finally {
      setLoadingDb(false);
    }
  };

  const reload = () => {
    loadOnChainPositions();
    loadDbPrevious();
  };

  // Active tab = ALL on-chain positions (active + redeemable + closeable)
  const activePositions = [
    ...(onChainPositions.active || []),
    ...(onChainPositions.redeemable || []),
    ...(onChainPositions.closeable || []),
  ];
  // Previous tab = DB historical positions only
  const previousPositions = dbPrevious;
  const displayedPositions = activeTab === 'active' ? activePositions : previousPositions;

  const loading = activeTab === 'active' ? loadingOnChain : loadingDb;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--text-secondary)]">Loading positions...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 rounded-xl bg-red-500/10 border border-red-500/30">
        <p className="text-red-400 text-sm text-center">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stats Summary */}


      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-[var(--border-color)]">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-4 py-2 md:px-6 md:py-3 text-lg md:text-xl font-medium md:font-bold transition-all duration-200 relative active:scale-95 active:opacity-80 ${activeTab === 'active'
            ? theme === 'light' ? 'text-black' : 'text-white'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          <div className="flex items-center gap-2">
            ACTIVE
            {walletAddress && activeTab === 'active' && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/20 text-green-400 border border-green-500/30" title="Fetched from blockchain">
                ⛓️ On-Chain
              </span>
            )}
          </div>
          {activePositions.length > 0 && (
            <span className={`ml-2 px-2 py-0.5 md:px-3 md:py-1 rounded-full text-xl md:text-2xl ${theme === 'light'
              ? 'bg-black/20 text-black'
              : 'bg-white/20 text-white'
              }`}>
              {activePositions.length}
            </span>
          )}
          {activeTab === 'active' && (
            <div className={`absolute bottom-0 left-0 right-0 h-0.5 md:h-1 ${theme === 'light' ? 'bg-black' : 'bg-white'
              }`} />
          )}
        </button>

        <button
          onClick={() => setActiveTab('previous')}
          className={`px-4 py-2 md:px-6 md:py-3 text-lg md:text-xl font-medium md:font-bold transition-all duration-200 relative active:scale-95 active:opacity-80 ${activeTab === 'previous'
            ? 'text-red-400'
            : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
            }`}
        >
          PREVIOUS
          {previousPositions.length > 0 && (
            <span className="ml-2 px-2 py-0.5 md:px-3 md:py-1 rounded-full bg-[var(--border-color)] text-[var(--text-secondary)] text-xs md:text-sm">
              {previousPositions.length}
            </span>
          )}
          {activeTab === 'previous' && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 md:h-1 bg-red-400" />
          )}
        </button>
      </div>

      {/* Positions List */}
      {displayedPositions.length === 0 ? (
        <div className="py-12 text-center">
          <div className="text-4xl mb-3">📊</div>
          <p className="text-[var(--text-secondary)] text-sm">
            {activeTab === 'active'
              ? 'No active positions yet. Start trading to see your positions here!'
              : 'No previous positions. Closed or resolved positions will appear here.'}
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {displayedPositions.map((position, index) => (
            <PositionCard
              key={`${position.marketTicker}-${position.side}-${index}`}
              position={position}
              allowActions={allowActions}
              isPrevious={activeTab === 'previous'}
              category={(position as any).category || undefined}
              onActionComplete={() => reload()}
            />
          ))}
        </div>
      )}
    </div>
  );
}

