'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  fetchJupiterProfile,
  fetchJupiterPnlHistory,
  fetchJupiterPositions,
  fetchJupiterTrades,
  fetchJupiterLeaderboards,
  formatMicroUsd,
  type Profile,
  type PnlHistoryPoint,
  type JupiterPosition,
  type Trade,
  type LeaderboardEntry,
} from '../../lib/jupiter-prediction';

export default function JupiterSocialPage() {
  const [pubkeyInput, setPubkeyInput] = useState('');
  const [pubkey, setPubkey] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [pnlHistory, setPnlHistory] = useState<PnlHistoryPoint[]>([]);
  const [positions, setPositions] = useState<JupiterPosition[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardSummary, setLeaderboardSummary] = useState<{ totalVolume?: number | string } | null>(null);
  const [loadingProfile, setLoadingProfile] = useState(false);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [profileTab, setProfileTab] = useState<'overview' | 'positions'>('overview');
  const [positionsTab, setPositionsTab] = useState<'active' | 'all'>('active');

  // Load profile + PnL + positions when pubkey is set.
  // Keep positions resilient: show them even if profile/PnL fails.
  useEffect(() => {
    if (!pubkey) {
      setProfile(null);
      setPnlHistory([]);
      setPositions([]);
      return;
    }
    let cancelled = false;
    setLoadingProfile(true);
    setError(null);
    Promise.allSettled([
      fetchJupiterProfile(pubkey),
      fetchJupiterPnlHistory(pubkey, { interval: '1w', count: 8 }),
      fetchJupiterPositions(pubkey),
    ])
      .then(([prof, pnlRes, posRes]) => {
        if (!cancelled) {
          if (prof.status === 'fulfilled') {
            setProfile(prof.value);
          } else {
            setProfile(null);
          }
          if (pnlRes.status === 'fulfilled') {
            setPnlHistory(pnlRes.value.data ?? []);
          } else {
            setPnlHistory([]);
          }
          if (posRes.status === 'fulfilled') {
            setPositions(posRes.value.data ?? []);
          } else {
            setPositions([]);
          }

          const errors: string[] = [];
          if (prof.status === 'rejected') errors.push('Profile unavailable');
          if (pnlRes.status === 'rejected') errors.push('PnL history unavailable');
          if (posRes.status === 'rejected') errors.push('Positions unavailable');
          setError(errors.length > 0 ? errors.join(' • ') : null);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingProfile(false);
      });
    return () => { cancelled = true; };
  }, [pubkey]);

  // Load trades + leaderboard on mount
  useEffect(() => {
    let cancelled = false;
    setLoadingFeed(true);
    Promise.all([
      fetchJupiterTrades(),
      fetchJupiterLeaderboards({ period: 'weekly', metric: 'pnl', limit: 10 }),
    ])
      .then(([tradesRes, leaderRes]) => {
        if (!cancelled) {
          setTrades(tradesRes.data ?? []);
          setLeaderboard(leaderRes.data ?? []);
          setLeaderboardSummary(leaderRes.summary ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setTrades([]);
          setLeaderboard([]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFeed(false);
      });
    return () => { cancelled = true; };
  }, []);

  const handleLoadProfile = () => {
    const trimmed = pubkeyInput.trim();
    if (trimmed) setPubkey(trimmed);
  };

  const activePositions = positions.filter((pos) => {
    const status = pos.marketMetadata?.status?.toLowerCase();
    if (status === 'open') return true;
    if (status === 'resolved' || status === 'closed') return false;
    return !pos.claimable && !pos.claimed;
  });
  const displayedPositions = positionsTab === 'active' ? activePositions : positions;

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-8">
        <div className="mb-6">
          <Link
            href="/jupiter"
            className="inline-flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--accent)] text-sm font-medium mb-4"
          >
            ← Back to Events
          </Link>
          <h1 className="text-3xl font-bold text-[var(--text-primary)] mb-2">
            Social Trading Terminal
          </h1>
          <p className="text-[var(--text-secondary)] mb-4">
            View trader profiles, P&L history, leaderboards, and the global trade feed.
          </p>
          <form
            onSubmit={(e) => { e.preventDefault(); handleLoadProfile(); }}
            className="flex flex-wrap gap-2 items-center"
          >
            <input
              type="text"
              placeholder="Trader pubkey (wallet address)"
              value={pubkeyInput}
              onChange={(e) => setPubkeyInput(e.target.value)}
              className="flex-1 min-w-[200px] px-4 py-2.5 rounded-xl bg-[var(--surface)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 rounded-xl bg-[var(--accent)] text-white font-medium hover:opacity-90 transition-opacity"
            >
              Load Profile
            </button>
          </form>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column: Profile + PnL History */}
          <div className="lg:col-span-1 space-y-6">
            {loadingProfile && (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-6 animate-pulse h-64" />
            )}
            {error && (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4 text-[var(--text-secondary)]">
                {error}
              </div>
            )}
            {!loadingProfile && pubkey && (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-2">
                <div className="flex items-center gap-1 rounded-lg bg-[var(--surface)] border border-[var(--border-color)] p-1">
                  <button
                    onClick={() => setProfileTab('overview')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      profileTab === 'overview'
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Profile
                  </button>
                  <button
                    onClick={() => setProfileTab('positions')}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                      profileTab === 'positions'
                        ? 'bg-[var(--accent)] text-white'
                        : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    Positions
                  </button>
                </div>
              </div>
            )}
            {!loadingProfile && profile && profileTab === 'overview' && (
              <>
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                  <h2 className="font-semibold text-[var(--text-primary)] mb-3">Trader Profile</h2>
                  <dl className="space-y-2 text-sm">
                    <Row label="Realized P&L" value={formatMicroUsd(profile.realizedPnlUsd)} />
                    <Row label="Total Volume" value={formatMicroUsd(profile.totalVolumeUsd)} />
                    <Row label="Open Value" value={formatMicroUsd(profile.totalPositionsValueUsd)} />
                    <Row label="Predictions" value={String(profile.predictionsCount ?? '—')} />
                    <Row label="Correct" value={String(profile.correctPredictions ?? '—')} />
                    <Row label="Wrong" value={String(profile.wrongPredictions ?? '—')} />
                    <Row label="Active Contracts" value={String(profile.totalActiveContracts ?? '—')} />
                  </dl>
                </div>
                <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                  <h2 className="font-semibold text-[var(--text-primary)] mb-3">P&L History (1w)</h2>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
                          <th className="py-2 pr-2">Time</th>
                          <th className="py-2">Realized P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pnlHistory.map((point, i) => (
                          <tr key={i} className="border-b border-[var(--border-color)]/50">
                            <td className="py-2 pr-2 text-[var(--text-secondary)]">
                              {new Date(point.timestamp).toLocaleString()}
                            </td>
                            <td className="py-2 text-[var(--text-primary)]">
                              {formatMicroUsd(point.realizedPnlUsd)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {pnlHistory.length === 0 && (
                    <p className="text-[var(--text-tertiary)] text-sm py-4">No P&L history.</p>
                  )}
                </div>
              </>
            )}

            {!loadingProfile && pubkey && (
              profileTab === 'positions' && (
              <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <h2 className="font-semibold text-[var(--text-primary)]">Positions</h2>
                  <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--surface)] border border-[var(--border-color)]">
                    <button
                      onClick={() => setPositionsTab('active')}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        positionsTab === 'active'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      Active ({activePositions.length})
                    </button>
                    <button
                      onClick={() => setPositionsTab('all')}
                      className={`px-2.5 py-1 text-xs rounded-md transition-colors ${
                        positionsTab === 'all'
                          ? 'bg-[var(--accent)] text-white'
                          : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                      }`}
                    >
                      All ({positions.length})
                    </button>
                  </div>
                </div>
                <div className="space-y-3 max-h-[360px] overflow-y-auto">
                  {displayedPositions.length === 0 && (
                    <p className="text-[var(--text-tertiary)] text-sm py-4">
                      {positionsTab === 'active' ? 'No active positions.' : 'No positions.'}
                    </p>
                  )}
                  {displayedPositions.map((pos) => (
                    <PositionRow key={pos.pubkey} position={pos} />
                  ))}
                </div>
              </div>
              )
            )}
          </div>

          {/* Right column: Leaderboard + Trade Feed */}
          <div className="lg:col-span-2 space-y-6">
            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <h2 className="font-semibold text-[var(--text-primary)] mb-3">Weekly PnL Leaderboard</h2>
              {loadingFeed ? (
                <div className="h-48 animate-pulse bg-[var(--surface)] rounded-xl" />
              ) : (
                <>
                  {leaderboardSummary?.totalVolume != null && (
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      Total volume: {formatMicroUsd(leaderboardSummary.totalVolume)}
                    </p>
                  )}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-[var(--text-tertiary)] border-b border-[var(--border-color)]">
                          <th className="py-2 pr-2">Rank</th>
                          <th className="py-2 pr-2">Trader</th>
                          <th className="py-2 pr-2">P&L</th>
                          <th className="py-2 pr-2">Volume</th>
                          <th className="py-2 pr-2">Win rate</th>
                          <th className="py-2">Predictions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leaderboard.map((row) => (
                          <tr key={row.ownerPubkey} className="border-b border-[var(--border-color)]/50">
                            <td className="py-2 pr-2 text-[var(--text-primary)]">{row.rank}</td>
                            <td className="py-2 pr-2 font-mono text-xs text-[var(--text-secondary)] truncate max-w-[120px]" title={row.ownerPubkey}>
                              {row.ownerPubkey.slice(0, 6)}…{row.ownerPubkey.slice(-4)}
                            </td>
                            <td className="py-2 pr-2 text-[var(--text-primary)]">{formatMicroUsd(row.realizedPnlUsd)}</td>
                            <td className="py-2 pr-2 text-[var(--text-secondary)]">{formatMicroUsd(row.totalVolumeUsd)}</td>
                            <td className="py-2 pr-2 text-[var(--text-secondary)]">{row.winRatePct != null ? `${row.winRatePct}%` : '—'}</td>
                            <td className="py-2 text-[var(--text-secondary)]">{row.predictionsCount ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {leaderboard.length === 0 && !loadingFeed && (
                    <p className="text-[var(--text-tertiary)] text-sm py-4">No leaderboard data.</p>
                  )}
                </>
              )}
            </div>

            <div className="rounded-2xl border border-[var(--border-color)] bg-[var(--card-bg)] p-4">
              <h2 className="font-semibold text-[var(--text-primary)] mb-3">Global Trade Feed</h2>
              {loadingFeed ? (
                <div className="h-64 animate-pulse bg-[var(--surface)] rounded-xl" />
              ) : (
                <div className="max-h-[400px] overflow-y-auto space-y-3">
                  {trades.length === 0 && <p className="text-[var(--text-tertiary)] text-sm">No recent trades.</p>}
                  {trades.map((trade, i) => (
                    <TradeRow key={`${trade.ownerPubkey}-${trade.timestamp}-${i}`} trade={trade} />
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function PositionRow({ position }: { position: JupiterPosition }) {
  const eventTitle = position.eventMetadata?.title ?? position.eventId ?? '—';
  const marketTitle = position.marketMetadata?.title ?? position.marketId ?? '—';
  const side = position.isYes ? 'Yes' : 'No';
  const pnl = position.pnlUsd != null ? parseFloat(String(position.pnlUsd)) : null;
  const pnlFormatted = pnl != null ? formatMicroUsd(pnl) : '—';
  const pnlPercent = position.pnlUsdPercent ?? null;
  const valueFormatted = formatMicroUsd(position.valueUsd ?? position.sizeUsd);
  const contracts = position.contracts ?? '—';
  const sellPriceFormatted = formatMicroUsd(position.sellPriceUsd);
  const isPositive = pnl != null && pnl >= 0;

  return (
    <div className="py-3 border-b border-[var(--border-color)]/50 last:border-0">
      <div className="flex items-start gap-2">
        <div
          className={`w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-xs font-bold ${
            position.isYes ? 'bg-[var(--accent-yes)]/20 text-[var(--accent-yes)]' : 'bg-pink-500/20 text-pink-400'
          }`}
        >
          {side}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium text-[var(--text-primary)] text-sm truncate" title={marketTitle}>
            {marketTitle}
          </p>
          <p className="text-xs text-[var(--text-tertiary)] truncate" title={eventTitle}>
            {eventTitle}
          </p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
            <span className="text-[var(--text-secondary)]">
              {contracts} contracts · {valueFormatted}
            </span>
            <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
              P&L {pnlFormatted}
              {pnlPercent != null ? ` (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)` : ''}
            </span>
            <span className="text-[var(--text-tertiary)]">Sell: {sellPriceFormatted}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="text-[var(--text-tertiary)]">{label}</dt>
      <dd className="text-[var(--text-primary)] font-medium">{value}</dd>
    </div>
  );
}

function TradeRow({ trade }: { trade: Trade }) {
  const time = trade.timestamp != null ? new Date(trade.timestamp).toLocaleString() : '—';
  const action = trade.action ?? '—';
  const side = trade.side ?? '—';
  const marketTitle = trade.marketTitle ?? trade.marketId;
  const eventTitle = trade.eventTitle ?? trade.eventId;
  const contracts = trade.contracts ?? '—';
  const price = formatMicroUsd(trade.priceUsd);
  const amount = formatMicroUsd(trade.amountUsd);
  const shortPubkey = trade.ownerPubkey ? `${trade.ownerPubkey.slice(0, 6)}…${trade.ownerPubkey.slice(-4)}` : '—';

  return (
    <div className="py-2 border-b border-[var(--border-color)]/50 last:border-0 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-[var(--text-primary)] capitalize">{action}</span>
        <span className="text-[var(--text-tertiary)] capitalize">{side}</span>
        <span className="text-[var(--text-secondary)]">·</span>
        <span className="text-[var(--text-tertiary)]">{time}</span>
      </div>
      <p className="text-[var(--text-secondary)] mt-1 truncate" title={marketTitle}>{marketTitle}</p>
      <p className="text-xs text-[var(--text-tertiary)] truncate" title={eventTitle}>{eventTitle}</p>
      <div className="mt-1 flex flex-wrap gap-3 text-[var(--text-tertiary)]">
        <span>Trader: {shortPubkey}</span>
        <span>Size: {contracts}</span>
        <span>Price: {price}</span>
        <span>Notional: {amount}</span>
      </div>
    </div>
  );
}
