'use client';

import { useState } from 'react';
import { useFundWallet } from '@privy-io/react-auth/solana';
import WithdrawModal from './WithdrawModal';

interface CreditCardProps {
  theme: 'light' | 'dark';
  loading: boolean;
  error: string | null;
  solBalance: number | null;
  usdcBalance: number | null;
  jupUsdBalance: number | null;
  solPrice: number | null;
  tradesCount: number;
  username?: string;
  walletAddress?: string;
  showBreakdown?: boolean;
  showStats?: boolean;
}

export default function CreditCard({
  theme,
  loading,
  error,
  solBalance,
  usdcBalance,
  jupUsdBalance,
  solPrice,
  tradesCount,
  username,
  walletAddress,
  showBreakdown = true,
  showStats = true,
}: CreditCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [copied, setCopied] = useState(false);
  const [withdrawModalOpen, setWithdrawModalOpen] = useState(false);
  const { fundWallet } = useFundWallet({
    onUserExited() {
      // Modal has been closed by the user
      // This callback ensures the modal state is properly handled
    },
  });

  const formatCurrency = (value: number | null | undefined) => {
    if (value === null || value === undefined || Number.isNaN(value)) return '—';
    return value.toLocaleString('en-US', {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 2,
    });
  };

  const solUsd = solBalance !== null && solPrice !== null ? solBalance * solPrice : null;
  const usdcUsd = usdcBalance !== null ? usdcBalance : null;
  const jupUsdUsd = jupUsdBalance !== null ? jupUsdBalance : null;
  const combinedUsd = (solUsd ?? 0) + (usdcUsd ?? 0) + (jupUsdUsd ?? 0);

  return (
    <div className="mb-6">
      <div
        onClick={() => setFlipped((f) => !f)}
        className="relative w-full max-w-md mx-auto aspect-[1.586/1] [perspective:1200px] focus:outline-none cursor-pointer"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setFlipped((f) => !f);
          }
        }}
        aria-label="Flip card"
      >
        <div
          className="relative h-full w-full [transform-style:preserve-3d]"
          style={{
            transform: flipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
            transition: 'transform 0.4s ease-out',
          }}
        >
          {/* FRONT SIDE */}
          <div
            className={`absolute inset-0 rounded-2xl overflow-hidden [backface-visibility:hidden] ${theme === 'light'
              ? 'shadow-xl'
              : 'shadow-2xl shadow-black/50'
              }`}
          >
            {/* Card Background with Gradient */}
            <div className={`absolute inset-0 ${theme === 'light'
              ? 'bg-gradient-to-br from-emerald-200 via-lime-300 to-green-200'
              : 'bg-gradient-to-br from-emerald-900/40 via-lime-900/40 to-green-900/40'
              }`}>
              {/* Decorative circles */}
              <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-2xl ${theme === 'light' ? 'bg-violet-200/40' : 'bg-white/10'
                }`} />
              <div className={`absolute -bottom-20 -left-20 w-48 h-48 rounded-full blur-3xl ${theme === 'light' ? 'bg-fuchsia-200/30' : 'bg-violet-400/20'
                }`} />
              <div className={`absolute top-1/2 right-1/4 w-32 h-32 rounded-full blur-2xl ${theme === 'light' ? 'bg-pink-200/20' : 'bg-fuchsia-300/10'
                }`} />
            </div>

            {/* Card Content */}
            <div className="relative h-full px-4 pb-4 pt-3 sm:px-7 sm:pb-7 sm:pt-4 flex flex-col justify-between" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
              {/* Top Row */}
              <div className="flex items-start justify-end">
                <span className={`text-[10px] sm:text-xs uppercase tracking-wider ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                  }`}>
                  Tap to flip
                </span>
              </div>

              {/* Middle Row - Balances */}
              {showBreakdown ? (
                <div className="flex-1 flex flex-col justify-center items-start -mt-2">
                  <p className={`text-sm sm:text-sm font-medium tracking-wider uppercase mb-2 ${theme === 'light' ? 'text-black/80' : 'text-white/60'
                    }`}>Balances</p>

                  {/* Combined USD */}
                  <div className="mb-3">
                    <p className={`text-xs font-medium tracking-wide uppercase mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                      }`}>Total (USD)</p>
                    {loading ? (
                      <div className={`h-7 w-28 rounded animate-pulse ${theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                        }`} />
                    ) : error ? (
                      <span className={`text-2xl font-extrabold tracking-tight ${theme === 'light' ? 'text-gray-400' : 'text-white'
                        }`}>--</span>
                    ) : (
                      <span className={`text-2xl sm:text-3xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                        }`}>
                        {formatCurrency(combinedUsd)}
                      </span>
                    )}
                  </div>

                  {/* Token Grid */}
                  <div className="grid grid-cols-3 gap-3 w-full">
                    {/* SOL Balance */}
                    <div>
                      <p className={`text-xs font-medium tracking-wide uppercase mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                        }`}>SOL</p>
                      {loading ? (
                        <div className={`h-6 w-20 rounded animate-pulse ${theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                          }`} />
                      ) : error ? (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-400' : 'text-black'
                          }`}>--</span>
                      ) : solBalance !== null ? (
                        <>
                          <p className={`text-xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}>
                            {solBalance.toFixed(3)}
                          </p>
                          {solPrice !== null && (
                            <p className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                              }`}>
                              ${(solBalance * solPrice).toFixed(2)}
                            </p>
                          )}
                        </>
                      ) : (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-700' : 'text-white/80'
                          }`}>0.000</span>
                      )}
                    </div>

                    {/* USDC Balance */}
                    <div>
                      <p className={`text-xs font-medium tracking-wide uppercase mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                        }`}>USDC</p>
                      {loading ? (
                        <div className={`h-6 w-20 rounded animate-pulse ${theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                          }`} />
                      ) : error ? (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-400' : 'text-black'
                          }`}>--</span>
                      ) : usdcBalance !== null ? (
                        <>
                          <p className={`text-xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}>
                            {usdcBalance.toFixed(2)}
                          </p>
                          <p className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                            }`}>
                            ${usdcBalance.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-700' : 'text-white/80'
                          }`}>0.00</span>
                      )}
                    </div>

                    {/* JupUSD Balance */}
                    <div>
                      <p className={`text-xs font-medium tracking-wide uppercase mb-1 ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                        }`}>JupUSD</p>
                      {loading ? (
                        <div className={`h-6 w-20 rounded animate-pulse ${theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                          }`} />
                      ) : error ? (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-400' : 'text-black'
                          }`}>--</span>
                      ) : jupUsdBalance !== null ? (
                        <>
                          <p className={`text-xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                            }`}>
                            {jupUsdBalance.toFixed(2)}
                          </p>
                          <p className={`text-xs ${theme === 'light' ? 'text-gray-600' : 'text-white/50'
                            }`}>
                            ${jupUsdBalance.toFixed(2)}
                          </p>
                        </>
                      ) : (
                        <span className={`text-lg font-bold ${theme === 'light' ? 'text-gray-700' : 'text-white/80'
                          }`}>0.00</span>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col justify-center items-start -mt-2">
                  <p className={`text-sm sm:text-sm font-medium tracking-wider uppercase mb-2 ${theme === 'light' ? 'text-black/80' : 'text-white/60'
                    }`}>Cash Balance</p>
                  {loading ? (
                    <div className={`h-8 w-32 rounded animate-pulse ${theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                      }`} />
                  ) : error ? (
                    <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${theme === 'light' ? 'text-gray-400' : 'text-white'
                      }`}>--</span>
                  ) : (
                    <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${theme === 'light' ? 'text-slate-900' : 'text-white'
                      }`}>
                      {formatCurrency(combinedUsd)}
                    </span>
                  )}
                </div>
              )}

              {/* Bottom Row - Stats */}
              {showStats && (
                <div className="flex items-end justify-between">
                  {/* Total Trades */}
                  <div>
                    <p className={`text-[10px] sm:text-xs font-medium tracking-wider uppercase mb-0.5 ${theme === 'light' ? 'text-gray-700' : 'text-white/90'
                      }`}>Total Bets</p>
                    <span className={`font-semibold text-base sm:text-xl ${theme === 'light' ? 'text-gray-700' : 'text-white'
                      }`}>{tradesCount}</span>
                  </div>

                  {/* PnL */}
                  <div className="text-right">
                    <p className={`text-sm sm:text-lg font-medium tracking-wider uppercase mb-0.5 ${theme === 'light' ? 'text-gray-700' : 'text-white/60'
                      }`}>P&L</p>
                    <div className="flex items-center justify-end gap-1.5">
                      <span className={`text-lg sm:text-2xl font-bold ${theme === 'light' ? 'text-gray-500' : 'text-white/60'
                        }`}>--</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Texture Overlay */}
            <div
              className="absolute inset-0 opacity-60 pointer-events-none mix-blend-overlay"
              style={{
                backgroundImage: `url("/texture.jpeg")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            {/* Shine Effect */}
            <div className={`absolute inset-0 pointer-events-none ${theme === 'light'
              ? 'bg-gradient-to-tr from-transparent via-white/30 to-white/50'
              : 'bg-gradient-to-tr from-transparent via-white/5 to-white/10'
              }`} />

            {/* Border */}
            {theme === 'light' && (
              <div className="absolute inset-0 rounded-2xl border border-gray-200/50 pointer-events-none" />
            )}
          </div>

          {/* BACK SIDE */}
          <div
            className={`absolute inset-0 rounded-2xl overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] ${theme === 'light'
              ? 'shadow-xl'
              : 'shadow-2xl shadow-black/50'
              }`}
          >
            {/* Card Background */}
            <div className={`absolute inset-0 ${theme === 'light'
              ? 'bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300'
              : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
              }`}>
              <div className={`absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl ${theme === 'light' ? 'bg-emerald-200/50' : 'bg-emerald-500/10'
                }`} />
              <div className={`absolute -bottom-16 -right-16 w-56 h-56 rounded-full blur-3xl ${theme === 'light' ? 'bg-lime-200/50' : 'bg-lime-500/10'
                }`} />
            </div>

            {/* Back Content */}
            <div className="relative h-full px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5 flex flex-col" style={{ fontFamily: 'Inter, system-ui, -apple-system, sans-serif' }}>
              {/* Top - Copy Button */}
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (walletAddress) {
                      navigator.clipboard.writeText(walletAddress);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }
                  }}
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${theme === 'light'
                    ? 'bg-white hover:bg-gray-100 text-gray-600'
                    : 'bg-white/10 hover:bg-white/20 text-white/70'
                    }`}
                  title="Copy wallet address"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs text-green-500">Copied!</span>
                    </>
                  ) : (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  )}
                </button>
              </div>

              {/* Middle - Spacer */}
              <div className="flex-1" />

              {/* Bottom - Action Buttons */}
              <div className="flex gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={async (e) => {
                    e.stopPropagation();
                    if (walletAddress) {
                      try {
                        await fundWallet({
                          address: walletAddress,
                        });
                      } catch (err) {
                        console.error('Fund wallet error:', err);
                      }
                    }
                  }}
                  className={`flex-1 py-2.5 sm:py-3 px-4 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 ${theme === 'light'
                    ? 'bg-slate-800 hover:bg-slate-700 text-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                    }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" />
                  </svg>
                  Deposit
                </button>

                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    if (walletAddress) {
                      setWithdrawModalOpen(true);
                    }
                  }}
                  className={`flex-1 py-2.5 sm:py-3 px-4 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 ${theme === 'light'
                    ? 'bg-white hover:bg-gray-50 text-gray-800 border border-gray-200'
                    : 'bg-white/10 hover:bg-white/20 text-white border border-white/20'
                    }`}
                >
                  <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                  </svg>
                  Withdraw
                </button>
              </div>

              {/* Bottom hint */}
              <p className={`text-center text-[10px] mt-3 ${theme === 'light' ? 'text-gray-500' : 'text-white/40'
                }`}>
                Tap to flip back
              </p>
            </div>

            {/* Texture Overlay */}
            <div
              className="absolute inset-0 opacity-30 pointer-events-none mix-blend-overlay"
              style={{
                backgroundImage: `url("/texture.jpeg")`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            />

            {/* Border */}
            <div className={`absolute inset-0 rounded-2xl pointer-events-none ${theme === 'light'
              ? 'border border-gray-300/50'
              : 'border border-white/10'
              }`} />
          </div>
        </div>
      </div>

      {/* Withdraw Modal */}
      {walletAddress && (
        <WithdrawModal
          isOpen={withdrawModalOpen}
          onClose={() => setWithdrawModalOpen(false)}
          walletAddress={walletAddress}
          solBalance={solBalance}
          usdcBalance={usdcBalance}
        />
      )}
    </div>
  );
}