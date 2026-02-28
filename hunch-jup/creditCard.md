
app\components\WithdrawModal.tsx
'use client';

import { useState } from 'react';
import { useFundWallet } from '@privy-io/react-auth/solana';
import WithdrawModal from './WithdrawModal';

interface CreditCardProps {
  theme: 'light' | 'dark';
  loading: boolean;
  error: string | null;
  solBalance: number | null;
  solPrice: number | null;
  tradesCount: number;
  username?: string;
  walletAddress?: string;
}

export default function CreditCard({
  theme,
  loading,
  error,
  solBalance,
  solPrice,
  tradesCount,
  username,
  walletAddress,
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
            className={`absolute inset-0 rounded-2xl overflow-hidden [backface-visibility:hidden] ${
        theme === 'light' 
          ? 'shadow-xl' 
          : 'shadow-2xl shadow-black/50'
            }`}
          >
        {/* Card Background with Gradient */}
        <div className={`absolute inset-0 ${
          theme === 'light'
                ? 'bg-gradient-to-br from-emerald-200 via-lime-300 to-green-200'
                : 'bg-gradient-to-br from-emerald-900/40 via-lime-900/40 to-green-900/40'
        }`}>
          {/* Decorative circles */}
          <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-2xl ${
            theme === 'light' ? 'bg-violet-200/40' : 'bg-white/10'
          }`} />
          <div className={`absolute -bottom-20 -left-20 w-48 h-48 rounded-full blur-3xl ${
            theme === 'light' ? 'bg-fuchsia-200/30' : 'bg-violet-400/20'
          }`} />
          <div className={`absolute top-1/2 right-1/4 w-32 h-32 rounded-full blur-2xl ${
            theme === 'light' ? 'bg-pink-200/20' : 'bg-fuchsia-300/10'
          }`} />
        </div>
        
            {/* Card Content */}
            <div className="relative h-full px-4 pb-4 pt-3 sm:px-7 sm:pb-7 sm:pt-4 flex flex-col justify-between">
              {/* Top Row */}
              <div className="flex items-start justify-end">
                <span className={`text-[10px] sm:text-xs uppercase tracking-wider ${
                  theme === 'light' ? 'text-gray-600' : 'text-white/50'
                }`}>
                  Tap to flip
                </span>
          </div>
          
          {/* Middle Row - Cash Balance */}
              <div className="flex-1 flex flex-col justify-center items-start -mt-2">
                <p className={`text-sm sm:text-sm font-medium tracking-wider uppercase mb-1 ${
                  theme === 'light' ? 'text-black/80' : 'text-white/60'
                }`}>Cash Balance</p>
                <div className="flex items-baseline gap-2">
                  {loading ? (
                    <div className={`h-8 w-24 sm:h-12 sm:w-36 rounded animate-pulse ${
                      theme === 'light' ? 'bg-gray-300/50' : 'bg-white/20'
                    }`} />
                  ) : error ? (
                    <span className={`text-2xl sm:text-4xl font-bold ${
                      theme === 'light' ? 'text-gray-400' : 'text-black'
                    }`}>--</span>
                  ) : solBalance !== null && solPrice !== null ? (
                    <span className={`text-3xl sm:text-4xl font-extrabold tracking-tight ${
                      theme === 'light' ? 'text-slate-900' : 'text-white'
                    }`}>
                      ${(solBalance * solPrice).toFixed(2)}
                    </span>
                  ) : (
                    <span className={`text-2xl sm:text-4xl font-bold ${
                      theme === 'light' ? 'text-gray-700' : 'text-white/80'
                    }`}>$0.00</span>
                  )}
                </div>
              </div>
          
          {/* Bottom Row - Stats */}
          <div className="flex items-end justify-between">
                {/* Total Trades */}
                <div>
                  <p className={`text-[10px] sm:text-xs font-medium tracking-wider uppercase mb-0.5 ${
                    theme === 'light' ? 'text-gray-700' : 'text-white/90'
                  }`}>Total Bets</p>
                  <span className={`font-semibold text-base sm:text-xl ${
                    theme === 'light' ? 'text-gray-700' : 'text-white'
                  }`}>{tradesCount}</span>
                </div>
                
            {/* PnL */}
                <div className="text-right">
                  <p className={`text-sm sm:text-lg font-medium tracking-wider uppercase mb-0.5 ${
                    theme === 'light' ? 'text-gray-700' : 'text-white/60'
                  }`}>P&L</p>
                  <div className="flex items-center justify-end gap-1.5">
                    <span className={`text-lg sm:text-2xl font-bold ${
                theme === 'light' ? 'text-gray-500' : 'text-white/60'
                }`}>--</span>
                  </div>
                </div>
              </div>
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
        <div className={`absolute inset-0 pointer-events-none ${
          theme === 'light'
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
            className={`absolute inset-0 rounded-2xl overflow-hidden [backface-visibility:hidden] [transform:rotateY(180deg)] ${
              theme === 'light' 
                ? 'shadow-xl' 
                : 'shadow-2xl shadow-black/50'
            }`}
          >
            {/* Card Background */}
            <div className={`absolute inset-0 ${
              theme === 'light'
                ? 'bg-gradient-to-br from-slate-100 via-gray-200 to-slate-300'
                : 'bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900'
            }`}>
              <div className={`absolute -top-16 -left-16 w-48 h-48 rounded-full blur-3xl ${
                theme === 'light' ? 'bg-emerald-200/50' : 'bg-emerald-500/10'
              }`} />
              <div className={`absolute -bottom-16 -right-16 w-56 h-56 rounded-full blur-3xl ${
                theme === 'light' ? 'bg-lime-200/50' : 'bg-lime-500/10'
              }`} />
            </div>

            {/* Back Content */}
            <div className="relative h-full px-4 pb-4 pt-4 sm:px-6 sm:pb-6 sm:pt-5 flex flex-col">
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
                  className={`p-2 rounded-lg transition-all flex items-center gap-1.5 ${
                    theme === 'light'
                      ? 'bg-white hover:bg-gray-100 text-gray-600'
                      : 'bg-white/10 hover:bg-white/20 text-white/70'
                  }`}
                  title="Copy wallet address"
                >
                  {copied ? (
                    <>
                      <svg className="w-4 h-4 text-[#00e003]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      <span className="text-xs text-[#00e003]">Copied!</span>
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
                  className={`flex-1 py-2.5 sm:py-3 px-4 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 ${
                    theme === 'light'
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
                  className={`flex-1 py-2.5 sm:py-3 px-4 font-bold rounded-xl transition-all text-sm sm:text-base flex items-center justify-center gap-2 ${
                    theme === 'light'
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
              <p className={`text-center text-[10px] mt-3 ${
                theme === 'light' ? 'text-gray-500' : 'text-white/40'
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
            <div className={`absolute inset-0 rounded-2xl pointer-events-none ${
              theme === 'light' 
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
        />
      )}
    </div>
  );
}

app\components\WithdrawModal.tsx

'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { useTheme } from './ThemeProvider';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  solBalance: number | null;
}

export default function WithdrawModal({
  isOpen,
  onClose,
  walletAddress,
  solBalance,
}: WithdrawModalProps) {
  const { theme } = useTheme();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [recipientAddress, setRecipientAddress] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [txSignature, setTxSignature] = useState<string | null>(null);

  const solanaWallet = wallets.find(w => w.address === walletAddress);
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
  const connection = new Connection(rpcUrl, 'confirmed');

  const handleClose = () => {
    if (!loading) {
      setRecipientAddress('');
      setAmount('');
      setStatus(null);
      setTxSignature(null);
      onClose();
    }
  };

  const validateInputs = (): boolean => {
    setStatus(null);

    if (!recipientAddress.trim()) {
      setStatus({ type: 'error', message: 'Enter recipient address' });
      return false;
    }

    try {
      new PublicKey(recipientAddress.trim());
    } catch {
      setStatus({ type: 'error', message: 'Invalid Solana address' });
      return false;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setStatus({ type: 'error', message: 'Enter a valid amount' });
      return false;
    }

    const amountInSOL = parseFloat(amount);
    if (solBalance !== null && amountInSOL > solBalance) {
      setStatus({ type: 'error', message: `Insufficient balance (${solBalance.toFixed(4)} SOL)` });
      return false;
    }

    if (amountInSOL < 0.001) {
      setStatus({ type: 'error', message: 'Minimum 0.001 SOL' });
      return false;
    }

    return true;
  };

  const handleWithdraw = async () => {
    if (!solanaWallet) {
      setStatus({ type: 'error', message: 'Wallet not connected' });
      return;
    }

    if (!validateInputs()) return;

    setLoading(true);
    setStatus({ type: 'info', message: 'Preparing...' });

    try {
      const recipientPubkey = new PublicKey(recipientAddress.trim());
      const amountInLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);

      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      const transferInstruction = SystemProgram.transfer({
        fromPubkey: new PublicKey(walletAddress),
        toPubkey: recipientPubkey,
        lamports: amountInLamports,
      });

      const transaction = new Transaction().add(transferInstruction);
      transaction.recentBlockhash = blockhash;
      transaction.feePayer = new PublicKey(walletAddress);
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      const transactionBytes = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      setStatus({ type: 'info', message: 'Confirm in wallet...' });

      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: solanaWallet,
        chain: 'solana:mainnet',
      });

      if (!result?.signature) {
        throw new Error('No signature received');
      }

      let signatureString: string;
      if (typeof result.signature === 'string') {
        signatureString = result.signature;
      } else if (result.signature instanceof Uint8Array) {
        const bs58Module = await import('bs58');
        const bs58 = bs58Module.default || bs58Module;
        signatureString = bs58.encode(result.signature);
      } else {
        throw new Error('Invalid signature format');
      }

      if (!signatureString) {
        throw new Error('Empty signature');
      }

      setTxSignature(signatureString);
      setStatus({ type: 'success', message: 'Transaction sent!' });

      // Confirm in background
      connection.confirmTransaction({
        signature: signatureString,
        blockhash,
        lastValidBlockHeight,
      }, 'confirmed').catch(console.warn);

      setTimeout(() => {
        setRecipientAddress('');
        setAmount('');
      }, 3000);

    } catch (error: any) {
      console.error('Withdraw error:', error);

      let msg = 'Transaction failed';
      if (error?.message?.includes('rejected') || error?.message?.includes('cancelled') || error?.message?.includes('denied')) {
        msg = 'Transaction cancelled';
      } else if (error?.message?.includes('insufficient') || error?.message?.includes('balance')) {
        msg = 'Insufficient balance for fees';
      } else if (error?.message?.includes('network') || error?.message?.includes('timeout')) {
        msg = 'Network error - try again';
      } else if (error?.message) {
        msg = error.message.length > 50 ? error.message.slice(0, 50) + '...' : error.message;
      }

      setStatus({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmount = () => {
    if (solBalance !== null && solBalance > 0.001) {
      setAmount((solBalance - 0.001).toFixed(6));
    }
  };

  // For portal mounting
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    return () => setMounted(false);
  }, []);

  if (!isOpen || !mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div
        className={`rounded-2xl shadow-2xl w-full max-w-sm mx-4 ${theme === 'light' ? 'bg-white' : 'bg-gray-900'
          } border border-[var(--border-color)]`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border-color)]">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Withdraw</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1.5 hover:bg-[var(--surface-hover)] rounded-lg transition-colors"
          >
            <svg className="w-5 h-5 text-[var(--text-secondary)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="px-5 py-4 space-y-4">
          {/* Balance */}
          <div className="text-center py-2">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Available</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '--'}
            </p>
          </div>

          {/* Recipient */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              To Address
            </label>
            <input
              type="text"
              value={recipientAddress}
              onChange={(e) => setRecipientAddress(e.target.value)}
              placeholder="Solana wallet address"
              disabled={loading}
              className={`w-full px-3 py-2.5 rounded-xl text-sm font-mono ${theme === 'light'
                ? 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                : 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500'
                } focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50`}
            />
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Amount</label>
              <button
                onClick={setMaxAmount}
                disabled={loading || !solBalance}
                className="text-xs text-violet-400 hover:text-violet-300 font-medium disabled:opacity-50"
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                step="0.001"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                disabled={loading}
                className={`w-full px-3 py-2.5 pr-14 rounded-xl text-sm ${theme === 'light'
                  ? 'bg-gray-50 border border-gray-200 text-gray-900 placeholder-gray-400'
                  : 'bg-gray-800 border border-gray-700 text-white placeholder-gray-500'
                  } focus:outline-none focus:ring-2 focus:ring-violet-500/50 disabled:opacity-50`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">SOL</span>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className={`px-3 py-2 rounded-lg text-sm ${status.type === 'success'
              ? 'bg-[#00e003]/10 text-[#00e003]'
              : status.type === 'error'
                ? 'bg-red-500/10 text-red-400'
                : 'bg-blue-500/10 text-blue-400'
              }`}>
              <p>{status.message}</p>
              {txSignature && status.type === 'success' && (
                <a
                  href={`https://solscan.io/tx/${txSignature}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs underline mt-1 block opacity-80 hover:opacity-100"
                >
                  View on Solscan →
                </a>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-2 flex gap-3">
          <button
            onClick={handleClose}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl font-medium text-sm transition-all ${theme === 'light'
              ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              : 'bg-gray-800 hover:bg-gray-700 text-gray-300'
              } disabled:opacity-50`}
          >
            Cancel
          </button>
          <button
            onClick={handleWithdraw}
            disabled={loading || !recipientAddress.trim() || !amount}
            className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-violet-600 hover:bg-violet-500 text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </span>
            ) : (
              'Confirm'
            )}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}