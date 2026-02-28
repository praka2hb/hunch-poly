'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSignAndSendTransaction, useWallets } from '@privy-io/react-auth/solana';
import { PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL, Connection } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, getAccount } from '@solana/spl-token';
import { useTheme } from './ThemeProvider';
import { USDC_MINT } from '../lib/tradeApi';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  walletAddress: string;
  solBalance: number | null;
  usdcBalance: number | null;
}

type TokenType = 'SOL' | 'USDC';

export default function WithdrawModal({
  isOpen,
  onClose,
  walletAddress,
  solBalance,
  usdcBalance,
}: WithdrawModalProps) {
  const { theme } = useTheme();
  const { wallets } = useWallets();
  const { signAndSendTransaction } = useSignAndSendTransaction();
  const [selectedToken, setSelectedToken] = useState<TokenType>('SOL');
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

    const amountNum = parseFloat(amount);
    const currentBalance = selectedToken === 'SOL' ? solBalance : usdcBalance;
    const tokenSymbol = selectedToken;

    if (currentBalance !== null && amountNum > currentBalance) {
      setStatus({ type: 'error', message: `Insufficient balance (${currentBalance.toFixed(selectedToken === 'SOL' ? 4 : 2)} ${tokenSymbol})` });
      return false;
    }

    // Minimum amount validation
    if (selectedToken === 'SOL' && amountNum < 0.001) {
      setStatus({ type: 'error', message: 'Minimum 0.001 SOL' });
      return false;
    }

    if (selectedToken === 'USDC' && amountNum < 0.01) {
      setStatus({ type: 'error', message: 'Minimum 0.01 USDC' });
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
      const senderPubkey = new PublicKey(walletAddress);
      const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

      let transaction = new Transaction();

      if (selectedToken === 'SOL') {
        // SOL transfer
        const amountInLamports = Math.floor(parseFloat(amount) * LAMPORTS_PER_SOL);
        const transferInstruction = SystemProgram.transfer({
          fromPubkey: senderPubkey,
          toPubkey: recipientPubkey,
          lamports: amountInLamports,
        });
        transaction.add(transferInstruction);
      } else {
        // USDC transfer
        const usdcMint = new PublicKey(USDC_MINT);
        const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000); // USDC has 6 decimals

        // Get sender's USDC token account
        const senderTokenAccount = await getAssociatedTokenAddress(
          usdcMint,
          senderPubkey
        );

        // Get recipient's USDC token account
        const recipientTokenAccount = await getAssociatedTokenAddress(
          usdcMint,
          recipientPubkey
        );

        // Check if recipient's token account exists
        let recipientAccountExists = false;
        try {
          await getAccount(connection, recipientTokenAccount);
          recipientAccountExists = true;
        } catch (err) {
          // Account doesn't exist, we'll need to create it
          recipientAccountExists = false;
        }

        // If recipient account doesn't exist, create it
        if (!recipientAccountExists) {
          const { createAssociatedTokenAccountInstruction } = await import('@solana/spl-token');
          const createAccountInstruction = createAssociatedTokenAccountInstruction(
            senderPubkey, // payer
            recipientTokenAccount, // associated token account
            recipientPubkey, // owner
            usdcMint // mint
          );
          transaction.add(createAccountInstruction);
        }

        // Add transfer instruction
        const transferInstruction = createTransferInstruction(
          senderTokenAccount,
          recipientTokenAccount,
          senderPubkey,
          amountInSmallestUnit,
          [],
          TOKEN_PROGRAM_ID
        );
        transaction.add(transferInstruction);
      }

      transaction.recentBlockhash = blockhash;
      transaction.feePayer = senderPubkey;
      transaction.lastValidBlockHeight = lastValidBlockHeight;

      const transactionBytes = transaction.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      setStatus({ type: 'info', message: 'Confirm in wallet...' });

      const result = await signAndSendTransaction({
        transaction: transactionBytes,
        wallet: solanaWallet,
        // options: {
        //   sponsor: true, // Enable Privy gas sponsorship
        // },
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
      console.error('Withdraw error (full):', error);
      console.error('Withdraw error message:', error?.message);

      let msg = 'Transaction failed';
      if (error?.message?.includes('rejected') || error?.message?.includes('cancelled') || error?.message?.includes('denied')) {
        msg = 'Transaction cancelled';
      } else if (error?.message?.includes('insufficient') || error?.message?.includes('balance')) {
        // Log more details about insufficient balance errors
        console.error('Insufficient balance error - check if Privy sponsorship is enabled for Solana');
        msg = 'Insufficient balance - ensure Privy gas sponsorship is configured';
      } else if (error?.message?.includes('network') || error?.message?.includes('timeout')) {
        msg = 'Network error - try again';
      } else if (error?.message) {
        msg = error.message.length > 80 ? error.message.slice(0, 80) + '...' : error.message;
      }

      setStatus({ type: 'error', message: msg });
    } finally {
      setLoading(false);
    }
  };

  const setMaxAmount = () => {
    if (selectedToken === 'SOL') {
      if (solBalance !== null && solBalance > 0.001) {
        setAmount((solBalance - 0.001).toFixed(6));
      }
    } else {
      if (usdcBalance !== null && usdcBalance > 0.01) {
        setAmount(usdcBalance.toFixed(6));
      }
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
          {/* Token Selector */}
          <div className="flex gap-2 p-1 bg-[var(--input-bg)] rounded-xl">
            <button
              type="button"
              onClick={() => {
                setSelectedToken('SOL');
                setAmount('');
              }}
              disabled={loading}
              className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${selectedToken === 'SOL'
                ? 'bg-white text-white shadow-lg'
                : theme === 'light'
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-gray-400 hover:bg-gray-800'
                } disabled:opacity-50`}
            >
              SOL
            </button>
            <button
              type="button"
              onClick={() => {
                setSelectedToken('USDC');
                setAmount('');
              }}
              disabled={loading}
              className={`flex-1 py-2 px-4 rounded-lg font-medium text-sm transition-all ${selectedToken === 'USDC'
                ? 'bg-white text-white shadow-lg'
                : theme === 'light'
                  ? 'text-gray-600 hover:bg-gray-100'
                  : 'text-gray-400 hover:bg-gray-800'
                } disabled:opacity-50`}
            >
              USDC
            </button>
          </div>

          {/* Balance */}
          <div className="text-center py-2">
            <p className="text-xs text-[var(--text-tertiary)] uppercase tracking-wide">Available</p>
            <p className="text-2xl font-bold text-[var(--text-primary)]">
              {selectedToken === 'SOL'
                ? solBalance !== null ? `${solBalance.toFixed(4)} SOL` : '--'
                : usdcBalance !== null ? `${usdcBalance.toFixed(2)} USDC` : '--'
              }
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
                } focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50`}
            />
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-medium text-[var(--text-secondary)]">Amount</label>
              <button
                onClick={setMaxAmount}
                disabled={loading || (selectedToken === 'SOL' ? !solBalance : !usdcBalance)}
                className="text-xs text-white hover:text-white font-medium disabled:opacity-50"
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
                  } focus:outline-none focus:ring-2 focus:ring-white/50 disabled:opacity-50`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--text-tertiary)]">{selectedToken}</span>
            </div>
          </div>

          {/* Status */}
          {status && (
            <div className={`px-3 py-2 rounded-lg text-sm ${status.type === 'success'
              ? 'bg-green-500/10 text-green-400'
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
            className="flex-1 py-2.5 rounded-xl font-medium text-sm bg-white hover:bg-white text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
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