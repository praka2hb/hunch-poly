'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import {
  fetchJupiterEventDetail,
  formatMicroUsd,
  formatVolumeUsd,
  createJupiterOrder,
  persistJupiterTrade,
  toUsdDecimalString,
  waitForConfirmedSignature,
  type JupiterEventDetail,
} from '../../../lib/jupiter-prediction';
import { useAuth } from '../../../components/AuthContext';

// Format price for display: Jupiter API returns micro-USD (e.g. 945000 = 94.5¢)
function formatPriceCents(value: number | undefined): number | null {
  if (value === undefined || value === null || Number.isNaN(value)) return null;
  if (value > 0 && value <= 1) return Math.round(value * 100); // Raw 0–1 fallback
  return Math.round((value / 1_000_000) * 100); // Micro-USD
}

export default function JupiterEventMarketsPage() {
  const params = useParams();
  const router = useRouter();
  const eventId = params?.eventId as string;
  const [event, setEvent] = useState<JupiterEventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAllMarkets, setShowAllMarkets] = useState(false);
  const [selectedMarketId, setSelectedMarketId] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [orderAmount, setOrderAmount] = useState('');
  const [orderLoading, setOrderLoading] = useState(false);
  const [orderStatus, setOrderStatus] = useState('');
  const [mobileTradeOpen, setMobileTradeOpen] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);

  const { ready, authenticated } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { requireAuth } = useAuth();
  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchJupiterEventDetail(eventId)
      .then((res) => {
        if (!cancelled) {
          setEvent(res);
          const list = res.markets ?? [];
          if (list.length > 0) setSelectedMarketId(list[0].marketId);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err?.message ?? 'Failed to load event');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [eventId]);

  useEffect(() => {
    const check = () => setIsMobileView(typeof window !== 'undefined' && window.innerWidth < 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const markets = event?.markets ?? [];
  const activeMarkets = markets.filter(
    (m) => m.status !== 'finalized' && m.status !== 'resolved' && m.status !== 'closed'
  );
  const displayedMarkets = showAllMarkets ? activeMarkets : activeMarkets.slice(0, 4);
  const selectedMarket = selectedMarketId
    ? markets.find((m) => m.marketId === selectedMarketId)
    : activeMarkets[0];

  const eventTitle = event?.metadata?.title ?? eventId;
  const eventSubtitle = event?.metadata?.subtitle ?? '';
  const eventImageUrl = event?.metadata?.imageUrl;
  const eventVolume = event?.volumeUsd != null ? formatMicroUsd(event.volumeUsd) : null;
  const eventCategory = event?.category ?? event?.subcategory;
  const isLive = event?.metadata?.isLive ?? event?.isLive ?? false;
  const closeCondition = event?.closeCondition ?? '';

  const handlePlaceOrder = async () => {
    if (!selectedMarket || selectedMarket.status !== 'open') {
      setOrderStatus('Market is not open for trading');
      return;
    }
    if (!authenticated) {
      requireAuth('Sign in to place your order');
      return;
    }
    if (!ready || !walletAddress || !solanaWallet) {
      setOrderStatus('Please connect your wallet first');
      return;
    }
    const amount = parseFloat(orderAmount);
    if (!orderAmount || Number.isNaN(amount) || amount <= 0) {
      setOrderStatus('Please enter a valid amount');
      return;
    }
    if (amount < 1) {
      setOrderStatus('Minimum 1 USD deposit for buys');
      return;
    }
    setOrderLoading(true);
    setOrderStatus('Requesting order...');
    try {
      const depositAmount = Math.floor(amount * 1_000_000).toString();
      const res = await createJupiterOrder({
        ownerPubkey: walletAddress,
        marketId: selectedMarket.marketId,
        isYes: selectedSide === 'yes',
        isBuy: true,
        depositAmount,
      });
      const transactionBase64 = res.transaction;
      if (!transactionBase64) {
        throw new Error('No transaction returned from Jupiter');
      }
      setOrderStatus('Signing transaction...');
      const transactionBytes = new Uint8Array(Buffer.from(transactionBase64, 'base64'));
      const signResult = await signTransaction({
        transaction: transactionBytes,
        wallet: solanaWallet,
      });
      if (!signResult?.signedTransaction) {
        throw new Error('No signed transaction received');
      }
      const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
        ? signResult.signedTransaction
        : new Uint8Array(signResult.signedTransaction);
      setOrderStatus('Sending transaction...');
      const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
      );
      const signedTx = VersionedTransaction.deserialize(signedTxBytes);
      const signature = await connection.sendTransaction(signedTx, {
        skipPreflight: true,
        maxRetries: 3,
      });
      setOrderStatus('Transaction submitted! Confirming...');
      await waitForConfirmedSignature(connection, signature);

      const executedInAmount = depositAmount;
      const executedOutAmount = res.order?.contracts;
      const amountUsd = toUsdDecimalString(executedInAmount);
      const numericEntryPrice = Number(res.order?.newAvgPriceUsd);
      const entryPrice = Number.isFinite(numericEntryPrice) ? numericEntryPrice : undefined;

      if (!amountUsd) {
        throw new Error('Unable to determine executed order amount');
      }

      setOrderStatus('Transaction confirmed! Storing trade...');
      await persistJupiterTrade({
        ownerPubkey: walletAddress,
        marketId: selectedMarket.marketId,
        eventId: event?.eventId ?? eventId,
        marketIdHash: res.order?.marketIdHash,
        isYes: selectedSide === 'yes',
        isBuy: true,
        amount: amountUsd,
        executedInAmount,
        executedOutAmount,
        transactionSig: signature,
        entryPrice,
        externalOrderId: res.externalOrderId,
        orderPubkey: res.order?.orderPubkey,
        positionPubkey: res.order?.positionPubkey,
      });

      setOrderStatus('Order placed successfully');
      setOrderAmount('');
      setMobileTradeOpen(false);
      setTimeout(() => setOrderStatus(''), 3000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to place order';
      setOrderStatus(`Error: ${msg}`);
    } finally {
      setOrderLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--background)]">
        <main className="max-w-7xl mx-auto px-4 py-8 pb-24">
          <div className="space-y-4">
            <div className="h-24 bg-[var(--surface)] rounded-2xl animate-pulse" />
            <div className="flex gap-6">
              <div className="flex-1 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 bg-[var(--surface)] rounded-xl animate-pulse" />
                ))}
              </div>
              <div className="w-[35%] hidden lg:block">
                <div className="h-96 bg-[var(--surface)] rounded-2xl animate-pulse" />
              </div>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[var(--background)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 bg-red-500/10 rounded-2xl flex items-center justify-center">
            <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <p className="text-[var(--text-secondary)] mb-4">{error}</p>
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-sm font-medium hover:opacity-90"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <main className="max-w-7xl mx-auto px-4 py-6 pb-8">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="text-sm font-medium">Back</span>
        </button>

        <div className="flex flex-col lg:flex-row gap-6">
          <div className="flex-1 lg:w-[65%] space-y-4">
            {/* Event Header - Image, Title, Metadata */}
            <div className="flex gap-4 p-4 bg-[var(--surface)] rounded-2xl">
              {eventImageUrl ? (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden flex-shrink-0">
                  <img
                    src={eventImageUrl}
                    alt={eventTitle}
                    className="w-full h-full object-cover"
                  />
                </div>
              ) : (
                <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-gradient-to-br from-white/20 to-gray-400/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">📊</span>
                </div>
              )}
              <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                  {eventCategory && (
                    <span className="px-2 py-0.5 rounded-md bg-black/60 text-white text-xs font-medium capitalize">
                      {eventCategory}
                    </span>
                  )}
                  {isLive && (
                    <span className="px-2 py-0.5 rounded-md bg-green-600/90 text-white text-xs font-medium">
                      Live
                    </span>
                  )}
                </div>
                <h1 className="text-lg md:text-xl font-bold text-[var(--text-primary)] leading-tight">
                  {eventTitle}
                </h1>
                {eventSubtitle && (
                  <p className="text-[var(--text-secondary)] text-sm mt-1">{eventSubtitle}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 mt-2 text-sm">
                  {eventVolume && (
                    <span className="text-[var(--text-tertiary)]">Volume {eventVolume}</span>
                  )}
                  {event?.metadata?.closeTime && (
                    <span className="text-[var(--text-tertiary)]">Closes {event.metadata.closeTime}</span>
                  )}
                </div>
                {closeCondition && (
                  <p className="text-xs text-[var(--text-tertiary)] mt-2 line-clamp-2" title={closeCondition}>
                    {closeCondition}
                  </p>
                )}
              </div>
            </div>

            {/* Markets List */}
            <div className="space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide px-1">
                Markets ({activeMarkets.length})
              </h2>

              {displayedMarkets.length === 0 ? (
                <div className="p-8 bg-[var(--surface)] rounded-2xl text-center">
                  <p className="text-[var(--text-tertiary)]">No active markets</p>
                </div>
              ) : (
                displayedMarkets.map((market) => {
                  const isSelected = selectedMarketId === market.marketId;
                  const title = market.metadata?.title ?? market.marketId;
                  const yesCents = formatPriceCents(market.pricing?.buyYesPriceUsd);
                  const noCents = formatPriceCents(market.pricing?.buyNoPriceUsd);
                  const chance = yesCents;

                  return (
                    <div
                      key={market.marketId}
                      onClick={() => setSelectedMarketId(market.marketId)}
                      className="p-3 rounded-xl cursor-pointer transition-all duration-200 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border-2 border-transparent"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                        <div className="flex items-center justify-between sm:flex-1 gap-2">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                              <span className="text-xs">🏈</span>
                            </div>
                            <h3 className="font-medium text-sm text-[var(--text-primary)] min-w-0 truncate">
                              {title}
                            </h3>
                          </div>
                          <span className="text-lg sm:text-xl font-bold text-[var(--text-primary)] flex-shrink-0">
                            {chance !== null ? `${chance}%` : '—'}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 sm:flex-shrink-0">
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMarketId(market.marketId);
                              setSelectedSide('yes');
                              if (isMobileView) setMobileTradeOpen(true);
                            }}
                            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:min-w-[100px] text-center transition-all cursor-pointer ${
                              isSelected && selectedSide === 'yes'
                                ? 'bg-[var(--accent-yes)] border-2 border-[var(--accent-yes)] shadow-lg shadow-[var(--accent-yes)]/25'
                                : 'bg-[var(--accent-yes)]/15 border border-[var(--accent-yes)]/50 hover:bg-[var(--accent-yes)]/25'
                            }`}
                          >
                            <span className={`font-bold text-xs sm:text-sm ${isSelected && selectedSide === 'yes' ? 'text-black' : 'text-[var(--accent-yes)]'}`}>
                              Yes {yesCents !== null ? `${yesCents}¢` : '—'}
                            </span>
                          </div>
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedMarketId(market.marketId);
                              setSelectedSide('no');
                              if (isMobileView) setMobileTradeOpen(true);
                            }}
                            className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:min-w-[100px] text-center transition-all cursor-pointer ${
                              isSelected && selectedSide === 'no' ? 'bg-pink-500 border-2 border-pink-400 shadow-lg shadow-pink-500/25' : 'bg-pink-500/15 border border-pink-500/30 hover:bg-pink-500/25'
                            }`}
                          >
                            <span className={`font-bold text-xs sm:text-sm ${isSelected && selectedSide === 'no' ? 'text-white' : 'text-pink-400'}`}>
                              No {noCents !== null ? `${noCents}¢` : '—'}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}

              {!showAllMarkets && activeMarkets.length > 4 && (
                <button
                  onClick={() => setShowAllMarkets(true)}
                  className="w-full p-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border-2 border-dashed border-[var(--border-color)] hover:border-white/30"
                >
                  Show {activeMarkets.length - 4} More Markets
                </button>
              )}
              {showAllMarkets && activeMarkets.length > 4 && (
                <button
                  onClick={() => setShowAllMarkets(false)}
                  className="w-full p-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                >
                  Show Less
                </button>
              )}
            </div>
          </div>

          {/* Right Column - Selected Market Detail (Desktop) */}
          <div className="hidden lg:block lg:w-[35%] flex-shrink-0">
            <div className="lg:sticky lg:top-6">
              {selectedMarket ? (
                <div className="bg-[var(--surface)] rounded-2xl overflow-hidden">
                  <div className="p-4 border-b border-[var(--border-color)]/50">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                        <span className="text-sm">🏈</span>
                      </div>
                      <h3 className="font-semibold text-[var(--text-primary)] leading-tight text-sm">
                        {selectedMarket.metadata?.title ?? selectedMarket.marketId}
                      </h3>
                    </div>
                    {selectedMarket.metadata?.subtitle && (
                      <p className="text-xs text-[var(--text-tertiary)] mt-1">{selectedMarket.metadata.subtitle}</p>
                    )}
                    <p className="text-xs text-[var(--text-tertiary)] mt-1 capitalize">
                      Status: {selectedMarket.status ?? '—'}
                    </p>
                  </div>
                  <div className="p-4 space-y-4">
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <p className="text-[var(--text-tertiary)]">Volume</p>
                        <p className="font-medium text-[var(--text-primary)]">
                          {(selectedMarket.pricing?.volume ?? selectedMarket.pricing?.volume24h) != null
                            ? selectedMarket.pricing?.volume24h != null
                              ? formatMicroUsd(selectedMarket.pricing.volume24h)
                              : formatVolumeUsd(selectedMarket.pricing?.volume)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">Liquidity</p>
                        <p className="font-medium text-[var(--text-primary)]">
                          {selectedMarket.pricing?.liquidityDollars != null
                            ? formatMicroUsd(selectedMarket.pricing.liquidityDollars)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">Open Interest</p>
                        <p className="font-medium text-[var(--text-primary)]">
                          {selectedMarket.pricing?.openInterest != null
                            ? formatMicroUsd(selectedMarket.pricing.openInterest)
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">YES</p>
                        <p className="font-medium text-[var(--accent-yes)]">
                          {formatPriceCents(selectedMarket.pricing?.buyYesPriceUsd) != null
                            ? `${formatPriceCents(selectedMarket.pricing?.buyYesPriceUsd)}¢`
                            : '—'}
                        </p>
                      </div>
                      <div>
                        <p className="text-[var(--text-tertiary)]">NO</p>
                        <p className="font-medium text-[var(--accent-no)]">
                          {formatPriceCents(selectedMarket.pricing?.buyNoPriceUsd) != null
                            ? `${formatPriceCents(selectedMarket.pricing?.buyNoPriceUsd)}¢`
                            : '—'}
                        </p>
                      </div>
                    </div>
                    {selectedMarket.metadata?.rulesPrimary && (
                      <details className="text-xs">
                        <summary className="text-[var(--text-tertiary)] cursor-pointer hover:text-[var(--text-secondary)]">
                          Resolution rules
                        </summary>
                        <p className="mt-2 text-[var(--text-secondary)] line-clamp-6 overflow-hidden" title={selectedMarket.metadata.rulesPrimary}>
                          {selectedMarket.metadata.rulesPrimary}
                        </p>
                      </details>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedSide('yes')}
                        className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                          selectedSide === 'yes'
                            ? 'bg-[var(--accent-yes)] border-2 border-[var(--accent-yes)] text-black'
                            : 'bg-[var(--accent-yes)]/20 border border-[var(--accent-yes)]/50 hover:bg-[var(--accent-yes)]/30 text-[var(--accent-yes)]'
                        } text-sm`}
                      >
                        Buy YES
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedSide('no')}
                        className={`flex-1 py-2.5 rounded-xl font-medium transition-colors ${
                          selectedSide === 'no'
                            ? 'bg-pink-500 border-2 border-pink-400 text-white'
                            : 'bg-pink-500/15 border border-pink-500/30 hover:bg-pink-500/25 text-pink-400'
                        } text-sm`}
                      >
                        Buy NO
                      </button>
                    </div>
                    <div className="flex gap-2 items-center">
                      <span className="text-sm text-[var(--text-secondary)]">$</span>
                      <input
                        type="number"
                        value={orderAmount}
                        onChange={(e) => setOrderAmount(e.target.value)}
                        placeholder="0"
                        min="0"
                        step="1"
                        disabled={orderLoading}
                        className="flex-1 px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border-color)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handlePlaceOrder}
                      disabled={orderLoading || !orderAmount || parseFloat(orderAmount) <= 0}
                      className="w-full py-3 rounded-xl font-medium bg-[var(--accent)] text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                    >
                      {orderLoading ? orderStatus : authenticated ? 'Place Order' : 'Sign in to trade'}
                    </button>
                    {orderStatus && (
                      <p className={`text-xs ${orderStatus.startsWith('Error') ? 'text-red-400' : orderStatus.includes('success') ? 'text-green-400' : 'text-[var(--text-secondary)]'}`}>
                        {orderStatus}
                      </p>
                    )}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--surface)] rounded-2xl p-8 text-center">
                  <p className="text-[var(--text-tertiary)]">Select a market</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Mobile Trade Drawer */}
      {isMobileView && mobileTradeOpen && selectedMarket && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/70" onClick={() => setMobileTradeOpen(false)} />
          <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-[var(--surface)] border-t border-[var(--border-color)] p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-[var(--text-primary)] truncate">
                {selectedMarket.metadata?.title ?? selectedMarket.marketId}
              </h3>
              <button
                onClick={() => setMobileTradeOpen(false)}
                className="w-8 h-8 rounded-full bg-[var(--surface-hover)] flex items-center justify-center text-[var(--text-primary)]"
                aria-label="Close"
              >
                ✕
              </button>
            </div>
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setSelectedSide('yes')}
                className={`flex-1 py-2.5 rounded-xl font-medium text-sm ${
                  selectedSide === 'yes' ? 'bg-[var(--accent-yes)] text-black' : 'bg-[var(--accent-yes)]/15 text-[var(--accent-yes)]'
                }`}
              >
                Yes {formatPriceCents(selectedMarket.pricing?.buyYesPriceUsd) != null ? `${formatPriceCents(selectedMarket.pricing?.buyYesPriceUsd)}¢` : '—'}
              </button>
              <button
                onClick={() => setSelectedSide('no')}
                className={`flex-1 py-2.5 rounded-xl font-medium text-sm ${
                  selectedSide === 'no' ? 'bg-pink-500 text-white' : 'bg-pink-500/15 text-pink-400'
                }`}
              >
                No {formatPriceCents(selectedMarket.pricing?.buyNoPriceUsd) != null ? `${formatPriceCents(selectedMarket.pricing?.buyNoPriceUsd)}¢` : '—'}
              </button>
            </div>
            <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-xl bg-[var(--background)] border border-[var(--border-color)]">
              <span className="text-sm text-[var(--text-secondary)]">$</span>
              <input
                type="number"
                value={orderAmount}
                onChange={(e) => setOrderAmount(e.target.value)}
                placeholder="0"
                min="0"
                step="1"
                disabled={orderLoading}
                className="flex-1 bg-transparent text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:outline-none"
              />
            </div>
            <button
              onClick={handlePlaceOrder}
              disabled={orderLoading || !orderAmount || parseFloat(orderAmount) <= 0}
              className="w-full py-3 rounded-xl font-medium bg-[var(--accent)] text-white disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {orderLoading ? orderStatus : authenticated ? 'Place Order' : 'Sign in to trade'}
            </button>
            {orderStatus && (
              <p className={`mt-2 text-xs ${orderStatus.startsWith('Error') ? 'text-red-400' : 'text-[var(--text-secondary)]'}`}>
                {orderStatus}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
