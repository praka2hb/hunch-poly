'use client';

import { useEffect, useMemo, useState } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useAuth } from '../components/AuthContext';
import { useTheme } from '../components/ThemeProvider';
import {
  BridgeQuoteResponse,
  BridgeSupportedAsset,
  BridgeWithdrawAddresses,
  fromBaseUnits,
} from '../lib/bridgeTypes';

type LoadingState = 'idle' | 'loading' | 'success' | 'error';

interface ChainOption {
  chainId: string;
  chainName: string;
}

export default function WithdrawPage() {
  const { ready, authenticated } = usePrivy();
  const { showLoginModal } = useAuth();
  const { theme } = useTheme();

  const [assets, setAssets] = useState<BridgeSupportedAsset[] | null>(null);
  const [assetsLoading, setAssetsLoading] = useState<LoadingState>('idle');
  const [assetsError, setAssetsError] = useState<string | null>(null);

  const [selectedChainId, setSelectedChainId] = useState<string | null>(null);
  const [selectedTokenAddress, setSelectedTokenAddress] = useState<string | null>(null);

  const [amount, setAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');

  const [quote, setQuote] = useState<BridgeQuoteResponse | null>(null);
  const [quoteLoading, setQuoteLoading] = useState<LoadingState>('idle');
  const [quoteError, setQuoteError] = useState<string | null>(null);

  const [withdrawResult, setWithdrawResult] = useState<BridgeWithdrawAddresses | null>(null);
  const [withdrawLoading, setWithdrawLoading] = useState<LoadingState>('idle');
  const [withdrawError, setWithdrawError] = useState<string | null>(null);

  // Require login similar to profile page
  useEffect(() => {
    if (ready && !authenticated) {
      showLoginModal('Sign in to withdraw from Polymarket');
    }
  }, [ready, authenticated, showLoginModal]);

  useEffect(() => {
    if (!ready) return;
    const fetchAssets = async () => {
      try {
        setAssetsLoading('loading');
        setAssetsError(null);
        const res = await fetch('/api/bridge/supported-assets', { method: 'GET' });
        if (!res.ok) {
          const text = await res.text();
          throw new Error(`Failed to load supported assets: ${res.status} - ${text}`);
        }
        const json = await res.json();
        const list: BridgeSupportedAsset[] = json.supportedAssets ?? json;
        setAssets(list);

        // Pick a sensible default chain/token
        if (list.length > 0) {
          // Prefer Solana as default if available, otherwise first chain
          const solAsset = list.find((a) =>
            a.chainName.toLowerCase().includes('solana'),
          );
          const initial = solAsset ?? list[0];
          setSelectedChainId(initial.chainId);
          setSelectedTokenAddress(initial.token.address);
        }
        setAssetsLoading('success');
      } catch (err: any) {
        console.error('[Withdraw] Failed to fetch supported assets:', err);
        setAssets(null);
        setAssetsError(err?.message || 'Failed to load supported assets');
        setAssetsLoading('error');
      }
    };
    fetchAssets();
  }, [ready]);

  const chainOptions: ChainOption[] = useMemo(() => {
    if (!assets) return [];
    const map = new Map<string, string>();
    for (const asset of assets) {
      if (!map.has(asset.chainId)) {
        map.set(asset.chainId, asset.chainName);
      }
    }
    return Array.from(map.entries()).map(([chainId, chainName]) => ({
      chainId,
      chainName,
    }));
  }, [assets]);

  const tokenOptions = useMemo(() => {
    if (!assets || !selectedChainId) return [];
    return assets
      .filter((a) => a.chainId === selectedChainId)
      .filter((a) => {
        const symbol = a.token.symbol.toUpperCase();
        const isSolana = a.chainName.toLowerCase().includes('solana');
        if (isSolana) {
          // For Solana, only surface USDC
          return symbol === 'USDC';
        }
        // For EVM chains, surface common stables
        return symbol === 'USDC' || symbol === 'USDT' || symbol === 'USDC.E';
      });
  }, [assets, selectedChainId]);

  const selectedAsset = useMemo(() => {
    if (!tokenOptions.length || !selectedTokenAddress) return null;
    return (
      tokenOptions.find((a) => a.token.address === selectedTokenAddress) ??
      tokenOptions[0] ??
      null
    );
  }, [tokenOptions, selectedTokenAddress]);

  const minCheckoutUsd = selectedAsset?.minCheckoutUsd ?? 0;

  const handleSelectChain = (chainId: string) => {
    setSelectedChainId(chainId);
    // Reset token and downstream state
    setQuote(null);
    setWithdrawResult(null);
    const firstToken = assets
      ?.filter((a) => a.chainId === chainId)
      .filter((a) => {
        const symbol = a.token.symbol.toUpperCase();
        const isSolana = a.chainName.toLowerCase().includes('solana');
        if (isSolana) return symbol === 'USDC';
        return symbol === 'USDC' || symbol === 'USDT' || symbol === 'USDC.E';
      })[0];
    setSelectedTokenAddress(firstToken?.token.address ?? null);
  };

  const handleSelectToken = (tokenAddress: string) => {
    setSelectedTokenAddress(tokenAddress);
    setQuote(null);
    setWithdrawResult(null);
  };

  const validateInputsForQuote = (): string | null => {
    if (!selectedAsset) {
      return 'Select a destination chain and token';
    }
    const value = parseFloat(amount);
    if (!value || !Number.isFinite(value) || value <= 0) {
      return 'Enter a valid amount';
    }
    if (value < minCheckoutUsd) {
      return `Minimum ${minCheckoutUsd.toFixed(2)} USDC for this route`;
    }
    if (!recipientAddress.trim()) {
      return 'Enter a destination address';
    }
    // Basic format checks
    const isSolana = selectedAsset.chainName.toLowerCase().includes('solana');
    if (!isSolana) {
      // EVM address: 0x + 40 hex chars
      if (!/^0x[a-fA-F0-9]{40}$/.test(recipientAddress.trim())) {
        return 'Enter a valid EVM address (0x...)';
      }
    } else {
      if (recipientAddress.trim().length < 32) {
        return 'Enter a valid Solana address';
      }
    }
    return null;
  };

  const handleGetQuote = async () => {
    setQuoteError(null);
    setWithdrawResult(null);
    const validationError = validateInputsForQuote();
    if (validationError) {
      setQuote(null);
      setQuoteError(validationError);
      return;
    }

    if (!selectedAsset) return;

    try {
      setQuoteLoading('loading');
      const res = await fetch('/api/bridge/quote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amountUsd: parseFloat(amount),
          toChainId: selectedAsset.chainId,
          toTokenAddress: selectedAsset.token.address,
          recipientAddress: recipientAddress.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Quote failed: ${res.status} - ${text}`);
      }
      const json = (await res.json()) as BridgeQuoteResponse;
      setQuote(json);
      setQuoteLoading('success');
    } catch (err: any) {
      console.error('[Withdraw] Quote error:', err);
      setQuote(null);
      setQuoteError(err?.message || 'Failed to fetch quote');
      setQuoteLoading('error');
    }
  };

  const handleCreateWithdraw = async () => {
    setWithdrawError(null);
    setWithdrawResult(null);

    const validationError = validateInputsForQuote();
    if (validationError) {
      setWithdrawError(validationError);
      return;
    }
    if (!selectedAsset) return;

    try {
      setWithdrawLoading('loading');
      const res = await fetch('/api/bridge/withdraw', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          toChainId: selectedAsset.chainId,
          toTokenAddress: selectedAsset.token.address,
          recipientAddress: recipientAddress.trim(),
        }),
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Withdraw setup failed: ${res.status} - ${text}`);
      }
      const json = (await res.json()) as BridgeWithdrawAddresses;
      setWithdrawResult(json);
      setWithdrawLoading('success');
    } catch (err: any) {
      console.error('[Withdraw] Withdraw error:', err);
      setWithdrawError(err?.message || 'Failed to create withdraw addresses');
      setWithdrawLoading('error');
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // swallow – UI remains usable even if copy fails
    }
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-16 h-16 border-4 border-white border-t-transparent rounded-full animate-spin" />
          <p className="text-[var(--text-secondary)] text-sm">Initializing...</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--background)]">
        <div className="text-center px-6">
          <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
            Sign in to withdraw
          </h2>
          <p className="text-[var(--text-secondary)] mb-6">
            Connect your account to withdraw from your Polymarket trading wallet.
          </p>
          <button
            onClick={() =>
              showLoginModal('Sign in to withdraw from your trading wallet')
            }
            className="px-8 py-3 bg-gradient-to-r from-white to-gray-500 hover:from-white hover:to-gray-400 text-white rounded-xl font-semibold transition-all"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-[var(--background)]"
      style={{ fontFamily: 'var(--font-inter)' }}
    >
      <main className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8 pb-24 md:pb-8">
        <h1 className="text-3xl font-extrabold text-[var(--text-primary)] mb-2">
          Withdraw from Polymarket
        </h1>
        <p className="text-[var(--text-secondary)] mb-6 max-w-2xl">
          Bridge USDC.e from your Polymarket trading wallet on Polygon to another
          chain. Funds are automatically bridged and swapped to your desired token
          on the destination chain.
        </p>

        <div className="space-y-6">
          {/* Step 1: Chain & token */}
          <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] p-4 sm:p-5">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-3">
              1. Destination network & token
            </h2>
            {assetsLoading === 'loading' && (
              <p className="text-[var(--text-secondary)] text-sm">Loading supported networks…</p>
            )}
            {assetsError && (
              <p className="text-red-400 text-sm">{assetsError}</p>
            )}
            {assets && chainOptions.length > 0 && (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase mb-1">
                    Destination chain
                  </label>
                  <select
                    value={selectedChainId ?? ''}
                    onChange={(e) => handleSelectChain(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                  >
                    {chainOptions.map((c) => (
                      <option key={c.chainId} value={c.chainId}>
                        {c.chainName}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase mb-1">
                    Destination token
                  </label>
                  <select
                    value={selectedTokenAddress ?? ''}
                    onChange={(e) => handleSelectToken(e.target.value)}
                    className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                  >
                    {tokenOptions.map((a) => (
                      <option key={a.token.address} value={a.token.address}>
                        {a.token.symbol} on {a.chainName}
                      </option>
                    ))}
                  </select>
                </div>

                {selectedAsset && (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Minimum withdrawal for this route:{' '}
                    <span className="font-semibold">
                      ${selectedAsset.minCheckoutUsd.toFixed(2)}
                    </span>
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Step 2: Amount & address */}
          <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] p-4 sm:p-5 space-y-4">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide mb-1">
              2. Amount & destination address
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase mb-1">
                  Amount (USDC.e on Polygon)
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setQuote(null);
                    setWithdrawResult(null);
                    setQuoteError(null);
                  }}
                  placeholder="0.00"
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[var(--text-tertiary)] uppercase mb-1">
                  Destination address
                </label>
                <input
                  type="text"
                  value={recipientAddress}
                  onChange={(e) => {
                    setRecipientAddress(e.target.value);
                    setQuote(null);
                    setWithdrawResult(null);
                    setQuoteError(null);
                  }}
                  placeholder={
                    selectedAsset?.chainName.toLowerCase().includes('solana')
                      ? 'Solana address'
                      : 'EVM address (0x...)'
                  }
                  className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--text-primary)] focus:outline-none focus:ring-2 focus:ring-emerald-400/70"
                />
              </div>
            </div>
            {quoteError && (
              <p className="text-xs text-red-400 mt-1">{quoteError}</p>
            )}
            <div className="flex items-center gap-3 mt-2">
              <button
                type="button"
                onClick={handleGetQuote}
                disabled={quoteLoading === 'loading' || assetsLoading === 'loading'}
                className="inline-flex items-center px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold shadow-sm hover:bg-emerald-400 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {quoteLoading === 'loading' ? 'Getting quote…' : 'Get quote'}
              </button>
            </div>
          </section>

          {/* Step 3: Quote details */}
          {quote && (
            <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] p-4 sm:p-5 space-y-3">
              <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
                3. Quote
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div>
                  <p className="text-[var(--text-tertiary)] text-xs uppercase mb-1">
                    Estimated output
                  </p>
                  <p className="text-[var(--text-primary)] font-semibold">
                    {fromBaseUnits(quote.estToTokenBaseUnit).toFixed(4)}{' '}
                    {selectedAsset?.token.symbol}
                  </p>
                  <p className="text-[var(--text-secondary)] text-xs">
                    ≈ ${quote.estOutputUsd.toFixed(2)}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-tertiary)] text-xs uppercase mb-1">
                    Fees & impact
                  </p>
                  <p className="text-[var(--text-primary)] text-xs">
                    Gas:{' '}
                    <span className="font-medium">
                      ${quote.estFeeBreakdown?.gasUsd?.toFixed(2) ?? '—'}
                    </span>
                  </p>
                  <p className="text-[var(--text-primary)] text-xs">
                    App fee:{' '}
                    <span className="font-medium">
                      {quote.estFeeBreakdown?.appFeePercent ?? 0}%
                    </span>
                  </p>
                  <p className="text-[var(--text-secondary)] text-xs">
                    Total impact:{' '}
                    {quote.estFeeBreakdown?.totalImpact != null
                      ? `${quote.estFeeBreakdown.totalImpact.toFixed(2)}%`
                      : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-[var(--text-tertiary)] text-xs uppercase mb-1">
                    Estimated time
                  </p>
                  <p className="text-[var(--text-primary)] font-semibold">
                    {Math.round(quote.estCheckoutTimeMs / 1000 / 60)} min
                  </p>
                  <p className="text-[var(--text-secondary)] text-xs">
                    Quote ID: {quote.quoteId.slice(0, 8)}…
                  </p>
                </div>
              </div>
            </section>
          )}

          {/* Step 4: Generate withdrawal addresses */}
          <section className="rounded-2xl bg-[var(--surface)] border border-[var(--border-color)] p-4 sm:p-5 space-y-3">
            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wide">
              4. Create withdrawal addresses
            </h2>
            <p className="text-xs text-[var(--text-secondary)] mb-2">
              This will generate deposit addresses for your Polymarket trading wallet.
              Send USDC.e from your trading wallet (Safe on Polygon) to the highlighted
              address to complete the withdrawal.
            </p>
            {withdrawError && (
              <p className="text-xs text-red-400 mb-1">{withdrawError}</p>
            )}
            <button
              type="button"
              onClick={handleCreateWithdraw}
              disabled={
                withdrawLoading === 'loading' ||
                assetsLoading === 'loading' ||
                quoteLoading === 'loading'
              }
              className="inline-flex items-center px-4 py-2 rounded-xl bg-[var(--surface-hover)] text-[var(--text-primary)] text-sm font-semibold border border-[var(--border-color)] hover:bg-[var(--surface)] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {withdrawLoading === 'loading'
                ? 'Creating addresses…'
                : 'Create withdrawal addresses'}
            </button>

            {withdrawResult && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl bg-amber-500/10 border border-amber-500/40 px-3 py-2 text-xs text-amber-100">
                  <p className="font-semibold mb-1">Important</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Do not pre-generate addresses far in advance.</li>
                    <li>
                      Always send from your Polymarket trading wallet (Safe on Polygon), not from
                      an external exchange.
                    </li>
                  </ul>
                </div>
                <div className="space-y-2 text-xs">
                  {Object.entries(withdrawResult.address).map(([key, value]) => (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-2 rounded-lg bg-[var(--background)] border border-[var(--border-color)] px-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-[var(--text-tertiary)] uppercase text-[10px] mb-1">
                          {key.toUpperCase()} deposit address
                        </p>
                        <p className="text-[var(--text-primary)] font-mono text-[11px] break-all">
                          {value}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleCopy(value)}
                        className="shrink-0 px-2 py-1 rounded-md border border-[var(--border-color)] text-[10px] text-[var(--text-secondary)] hover:bg-[var(--surface-hover)]"
                      >
                        Copy
                      </button>
                    </div>
                  ))}
                </div>
                {withdrawResult.note && (
                  <p className="text-[var(--text-secondary)] text-xs">
                    {withdrawResult.note}
                  </p>
                )}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

