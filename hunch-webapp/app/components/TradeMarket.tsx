'use client';

import { useState, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Market } from '../lib/api';
import { parseMarketTicker, formatMarketTitle } from '../lib/marketUtils';
import { fetchMarketProbabilities, MarketProbabilities } from '../lib/probabilityUtils';
import { requestOrder, getOrderStatus, OrderResponse, USDC_MINT } from '../lib/tradeApi';
import TradeQuoteModal from './TradeQuoteModal';
import { useAuth } from './AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import { useCatSafe } from '../contexts/CatContext';

interface TradeMarketProps {
  market: Market;
  initialSide?: 'yes' | 'no';
}

export default function TradeMarket({ market, initialSide = 'yes' }: TradeMarketProps) {
  const { ready, authenticated, user } = usePrivy();
  const { wallets } = useWallets();
  const { signTransaction } = useSignTransaction();
  const { currentUserId, triggerPositionsRefresh } = useAppData(); // Get userId from context

  // Create Solana connection for sending transactions
  const connection = new Connection(
    process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
    'confirmed'
  );
  const { requireAuth } = useAuth();
  const catContext = useCatSafe();
  const [side, setSide] = useState<'yes' | 'no'>(initialSide);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [probabilities, setProbabilities] = useState<MarketProbabilities>({
    yesProbability: null,
    noProbability: null,
    loading: true,
    error: null,
  });

  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [currentTradeId, setCurrentTradeId] = useState<string | null>(null);
  const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
  const [pendingTradePayload, setPendingTradePayload] = useState<any | null>(null);
  const [quotePreview, setQuotePreview] = useState<{
    estimatedSpendUsdc?: string;
    estimatedTokens?: string;
    entryPrice?: string;
  } | null>(null);
  const [lastQuoteSummary, setLastQuoteSummary] = useState<{
    estimatedSpendUsdc?: string;
    estimatedTokens?: string;
    entryPrice?: string;
  } | null>(null);

  // Get the first Solana wallet from useWallets
  const solanaWallet = wallets[0];
  const walletAddress = solanaWallet?.address;

  // Update side when initialSide changes
  useEffect(() => {
    setSide(initialSide);
  }, [initialSide]);

  // Fetch market probabilities
  useEffect(() => {
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

  // Get mint address for YES or NO token
  const getMintAddress = (type: 'yes' | 'no'): string | undefined => {
    if (market.accounts && typeof market.accounts === 'object') {
      const usdcAccount = (market.accounts as any)[USDC_MINT];
      if (usdcAccount) {
        const mint = type === 'yes' ? usdcAccount.yesMint : usdcAccount.noMint;
        if (mint) return mint;
      }

      const accountKeys = Object.keys(market.accounts);
      for (const key of accountKeys) {
        const account = (market.accounts as any)[key];
        if (account && typeof account === 'object') {
          const mint = type === 'yes' ? account.yesMint : account.noMint;
          if (mint) return mint;
        }
      }
    }

    const mint = type === 'yes' ? market.yesMint : market.noMint;
    return mint;
  };

  useEffect(() => {
    if (!walletAddress || !amount || parseFloat(amount) <= 0) {
      setQuotePreview(null);
      return;
    }
    if (market.status !== 'active') {
      setQuotePreview(null);
      return;
    }

    const outputMint = getMintAddress(side);
    if (!outputMint) {
      setQuotePreview(null);
      return;
    }

    const debounce = setTimeout(async () => {
      try {
        const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000).toString();
        const orderResponse = await requestOrder({
          userPublicKey: walletAddress,
          inputMint: USDC_MINT,
          outputMint,
          amount: amountInSmallestUnit,
          slippageBps: 100,
        });

        const spentUsdc = orderResponse.inAmount
          ? Number(orderResponse.inAmount) / 1_000_000
          : Number(amountInSmallestUnit) / 1_000_000;
        const receivedTokens = orderResponse.outAmount
          ? Number(orderResponse.outAmount) / 1_000_000
          : null;
        const entryPrice =
          receivedTokens && receivedTokens > 0 ? spentUsdc / receivedTokens : null;

        setQuotePreview({
          estimatedSpendUsdc: Number.isFinite(spentUsdc) ? spentUsdc.toFixed(6) : undefined,
          estimatedTokens: Number.isFinite(receivedTokens)
            ? receivedTokens?.toFixed(6)
            : undefined,
          entryPrice: entryPrice !== null && Number.isFinite(entryPrice)
            ? entryPrice.toFixed(10)
            : undefined,
        });
      } catch (error) {
        setQuotePreview(null);
      }
    }, 450);

    return () => clearTimeout(debounce);
  }, [amount, side, walletAddress, market.status]);

  /**
   * Real trade handler using DFlow API
   * 
   * Flow:
   * 1. Validate user and inputs
   * 2. Request order from DFlow API
   * 3. Sign transaction
   * 4. Submit to blockchain
   * 5. WAIT for transaction confirmation (CRITICAL)
   * 6. Extract execution details (price, amounts)
   * 7. Store trade in database (ONLY after confirmation)
   * 8. Show quote modal for user comments
   */
  const handlePlaceOrder = async () => {
    // Show login modal if not authenticated
    if (!authenticated) {
      requireAuth('Sign in to place your trade');
      return;
    }

    if (!ready || !walletAddress || !user) {
      setStatus('Please connect your wallet first');
      return;
    }

    if (!amount || parseFloat(amount) <= 0) {
      setStatus('Please enter a valid amount');
      return;
    }

    if (market.status !== 'active') {
      setStatus(`❌ Market is not active. Current status: ${market.status || 'unknown'}`);
      return;
    }

    // Get mint addresses
    const outputMint = getMintAddress(side);
    if (!outputMint) {
      setStatus('❌ Unable to find market token mint address');
      return;
    }

    setLoading(true);
    setStatus('Requesting order...');

    try {
      // Convert amount to smallest unit (USDC has 6 decimals)
      const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000).toString();

      const attemptOrder = async () => {
        // Request order from DFlow API
        const orderResponse: OrderResponse = await requestOrder({
          userPublicKey: walletAddress,
          inputMint: USDC_MINT,
          outputMint: outputMint,
          amount: amountInSmallestUnit,
          slippageBps: 100, // 1% slippage
        });

        setStatus('Signing transaction...');

        // Get transaction from DFlow API response - it's base64 encoded
        const transactionBase64 = orderResponse.transaction || orderResponse.openTransaction;
        if (!transactionBase64) {
          throw new Error('No transaction found in order response');
        }

        console.log('Extracting transaction from DFlow response:', {
          hasTransaction: !!orderResponse.transaction,
          hasOpenTransaction: !!orderResponse.openTransaction,
          executionMode: orderResponse.executionMode,
        });

        // Decode the transaction from base64 to Uint8Array
        const transactionBytes = new Uint8Array(Buffer.from(transactionBase64, 'base64'));

        // Sign the transaction using Privy
        const signResult = await signTransaction({
          transaction: transactionBytes,
          wallet: solanaWallet,
        });

        if (!signResult?.signedTransaction) {
          throw new Error('No signed transaction received');
        }

        // Get the signed transaction as Uint8Array
        const signedTxBytes = signResult.signedTransaction instanceof Uint8Array
          ? signResult.signedTransaction
          : new Uint8Array(signResult.signedTransaction);

        setStatus('Sending transaction...');

        // Create VersionedTransaction from signed bytes and send it
        const signedTransaction = VersionedTransaction.deserialize(signedTxBytes);

        // Send the signed transaction to the network
        const signature = await connection.sendTransaction(signedTransaction, {
          skipPreflight: true, // Skip simulation for DFlow transactions
          maxRetries: 3,
        });

        // connection.sendTransaction returns a Promise<string> with base58 signature
        const signatureString = signature;

        return { orderResponse, signatureString };
      };

      let orderResponse: OrderResponse;
      let signatureString: string;
      try {
        ({ orderResponse, signatureString } = await attemptOrder());
      } catch (error: any) {
        const msg = (error?.message || '').toLowerCase();
        const shouldRetry =
          msg.includes('transaction simulation failed') ||
          msg.includes('blockhash not found');
        if (!shouldRetry) throw error;
        setStatus('Refreshing quote and retrying...');
        ({ orderResponse, signatureString } = await attemptOrder());
      }

      setStatus('Transaction submitted! Confirming...');

      // Wait for transaction confirmation before storing trade
      // IMPORTANT: Always wait for confirmation before DB operations
      const maxAttempts = 30;
      let attempts = 0;
      let confirmationStatus;

      // Wait for transaction to be confirmed (at least confirmed status)
      while (attempts < maxAttempts) {
        const statusResult = await connection.getSignatureStatuses([signatureString]);
        confirmationStatus = statusResult.value[0];

        // Check if transaction failed
        if (confirmationStatus?.err) {
          throw new Error(`Transaction failed: ${JSON.stringify(confirmationStatus.err)}`);
        }

        // If confirmed or finalized, we're done
        if (confirmationStatus &&
          (confirmationStatus.confirmationStatus === 'confirmed' ||
            confirmationStatus.confirmationStatus === 'finalized')) {
          break;
        }

        // Otherwise wait and retry
        await new Promise((resolve) => setTimeout(resolve, 1000));
        attempts++;
      }

      if (attempts >= maxAttempts) {
        throw new Error('Transaction confirmation timeout - transaction may still be processing');
      }

      // Only proceed if transaction is confirmed
      if (!confirmationStatus ||
        (confirmationStatus.confirmationStatus !== 'confirmed' &&
          confirmationStatus.confirmationStatus !== 'finalized')) {
        throw new Error('Transaction not confirmed');
      }

      setStatus('Transaction confirmed! Storing trade...');

      // ============================================================
      // CRITICAL: Only execute DB operations after confirmation
      // Transaction is now confirmed on blockchain, safe to proceed
      // ============================================================

      // Check if user is synced
      if (!currentUserId) {
        throw new Error('User not synced. Please refresh and try again.');
      }

      // If Trade API says async, the chain tx can confirm but the order may still be settling.
      // Only treat as success once /order-status reports "closed".
      if (orderResponse.executionMode === 'async') {
        setStatus('⏳ Order is processing (async). Waiting for completion...');

        const maxAttempts = 45;
        let attempts = 0;
        while (attempts < maxAttempts) {
          const st = await getOrderStatus(signatureString);
          if (st.status === 'closed') break;
          if (st.status === 'failed') {
            throw new Error('Trade execution failed (async order-status)');
          }
          attempts++;
          await new Promise((r) => setTimeout(r, 2000));
        }
        if (attempts >= maxAttempts) {
          throw new Error('Async trade still processing. Please check again in a moment.');
        }
      }

      // Compute entryPrice from quote-implied amounts (uses inAmount, not user budget)
      // entryPrice = (inAmount USDC) / (outAmount outcomeTokens)
      // Fallback to request amount if response doesn't include inAmount
      const spentUsdc =
        orderResponse.inAmount
          ? Number(orderResponse.inAmount) / 1_000_000
          : Number(amountInSmallestUnit) / 1_000_000;

      const receivedTokens =
        orderResponse.outAmount ? Number(orderResponse.outAmount) / 1_000_000 : null;

      let entryPrice: number | null = null;
      if (
        spentUsdc !== null &&
        receivedTokens !== null &&
        Number.isFinite(spentUsdc) &&
        Number.isFinite(receivedTokens) &&
        receivedTokens > 0
      ) {
        entryPrice = spentUsdc / receivedTokens;
      }

      setLastQuoteSummary({
        estimatedSpendUsdc: spentUsdc !== null && Number.isFinite(spentUsdc) ? spentUsdc.toFixed(6) : undefined,
        estimatedTokens: receivedTokens !== null && Number.isFinite(receivedTokens) ? receivedTokens.toFixed(6) : undefined,
        entryPrice: entryPrice !== null && Number.isFinite(entryPrice) ? entryPrice.toFixed(10) : undefined,
      });

      // ============================================================
      // SUCCESS: Trade confirmed on blockchain
      // Now show the quote modal FIRST, then store trade depending on user action.
      // ============================================================

      const tradePayload = {
        userId: currentUserId,
        marketTicker: market.ticker,
        eventTicker: market.eventTicker || null,
        side: side,
        amount: spentUsdc.toFixed(6), // Store actual inAmount (USDC spent)
        transactionSig: signatureString,
        // Store only entryPrice as requested (quote-implied), omit executed sizes.
        entryPrice: entryPrice !== null ? entryPrice.toString() : null,
      };

      console.log('📝 Pending trade payload (will store after quote modal):', tradePayload);
      setPendingTradePayload(tradePayload);
      // Trigger peek cat on successful trade
      if (catContext) {
        catContext.triggerPeekCat('Good hunch.');
      }
      setStatus('✅ Trade executed successfully! Add a comment or skip.');
      setLoading(false);
      setShowQuoteModal(true);
      return;
    } catch (error: any) {
      // Enhanced error handling for transaction failures
      let errorMessage = error.message || 'Unknown error occurred';

      // Parse Solana InstructionError for better user feedback
      if (error.message?.includes('InstructionError')) {
        try {
          // Extract error details from message like: {"InstructionError":[2,{"Custom":1}]}
          const match = error.message.match(/\{.*\}/);
          if (match) {
            const errorObj = JSON.parse(match[0]);
            if (errorObj.InstructionError) {
              const [instructionIndex, errorDetail] = errorObj.InstructionError;

              // Custom error code 1 typically means insufficient balance or invalid state
              if (errorDetail?.Custom === 1) {
                errorMessage = '❌ Transaction failed: Insufficient USDC balance or market liquidity issue. Please check your wallet balance and try a smaller amount.';
              } else if (errorDetail?.Custom === 6000) {
                errorMessage = '❌ Slippage tolerance exceeded. The price moved too much. Please try again with a higher slippage or different amount.';
              } else {
                errorMessage = `❌ Transaction failed at instruction ${instructionIndex}. Error code: ${JSON.stringify(errorDetail)}. This may be due to insufficient balance, invalid market state, or network issues.`;
              }
            }
          }
        } catch (parseError) {
          // If parsing fails, use the original error message
          console.error('Error parsing InstructionError:', parseError);
        }
      } else if (error.message?.includes('Transaction simulation failed')) {
        errorMessage = '❌ Transaction simulation failed. This may be due to insufficient balance, expired blockhash, or invalid transaction. Please try again.';
      } else if (error.message?.includes('User rejected')) {
        errorMessage = 'Transaction was cancelled';
      } else if (error.message?.includes('insufficient funds')) {
        errorMessage = '❌ Insufficient USDC balance. Please ensure you have enough USDC in your wallet.';
      } else if (error.message?.includes('blockhash not found')) {
        errorMessage = '❌ Transaction expired. Please try again.';
      }

      console.error('Trade error:', error);
      setStatus(`❌ Error: ${errorMessage}`);
    } finally {
      setLoading(false);
    }
  };

  // Monitor async trade execution
  const monitorAsyncTrade = async (signature: string) => {
    const maxAttempts = 30;
    let attempts = 0;

    const checkStatus = async () => {
      try {
        const statusResponse = await getOrderStatus(signature);

        if (statusResponse.status === 'closed') {
          setStatus('✅ Trade executed successfully!');
          setShowQuoteModal(true);
        } else if (statusResponse.status === 'failed') {
          setStatus('❌ Trade execution failed');
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 2000); // Check every 2 seconds
        } else {
          setStatus('⏳ Trade is still processing. Check your wallet for updates.');
        }
      } catch (error: any) {
        console.error('Error checking trade status:', error);
        if (attempts < maxAttempts) {
          attempts++;
          setTimeout(checkStatus, 2000);
        }
      }
    };

    setTimeout(checkStatus, 2000); // Start checking after 2 seconds
  };

  /**
   * Quote submission handler
   * 
   * This is a SEPARATE operation that happens AFTER trade is confirmed and stored.
   * It updates the trade record with user's optional comment/quote.
   * This is safe to fail without affecting the trade execution.
   */
  const handleQuoteSubmit = async (quote: string) => {
    if (!pendingTradePayload) return;
    setIsSubmittingQuote(true);

    try {
      const finalQuote = quote.trim();
      const payloadToStore = {
        ...pendingTradePayload,
        ...(finalQuote ? { quote: finalQuote } : {}),
      };

      console.log('💾 Storing trade AFTER quote modal:', payloadToStore);
      const response = await fetch('/api/trades', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payloadToStore),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to store trade');
      }

      const createdTrade = await response.json();
      setCurrentTradeId(createdTrade.id);

      // Close modal and reset form
      setShowQuoteModal(false);
      setPendingTradePayload(null);
      setAmount('');
      setStatus(finalQuote ? '✅ Trade shared successfully!' : '✅ Trade saved successfully!');

      // Trigger global positions refresh
      triggerPositionsRefresh();

      // Clear status after 3 seconds
      setTimeout(() => {
        setStatus('');
      }, 3000);
    } catch (error: any) {
      console.error('Error submitting quote:', error);
      setStatus(`❌ Error: ${error.message}`);
    } finally {
      setIsSubmittingQuote(false);
    }
  };

  const dateInfo = parseMarketTicker(market.ticker);
  const displayTitle = formatMarketTitle(market.title || 'Untitled Market', market.ticker);

  return (
    <>
      <div className="space-y-4">
        <div className="space-y-4">
          {/* Side Selection */}
          <div>

            {/* Probability Display */}
            {market.status === 'active' && !probabilities.loading &&
              (probabilities.yesProbability !== null || probabilities.noProbability !== null) && (
                <div className="flex gap-2 mb-2">
                  <div className="flex-1 text-center">
                    <div className="text-lg font-bold text-[var(--accent)] font-number">
                      {probabilities.yesProbability !== null
                        ? `${probabilities.yesProbability}%`
                        : '--'}
                    </div>
                  </div>
                  <div className="flex-1 text-center">
                    <div className="text-lg font-bold text-[var(--accent-fuchsia)] font-number">
                      {probabilities.noProbability !== null
                        ? `${probabilities.noProbability}%`
                        : '--'}
                    </div>
                  </div>
                </div>
              )}
            {probabilities.loading && market.status === 'active' && (
              <div className="flex items-center justify-center gap-2 mb-2 text-xs text-[var(--text-tertiary)]">
                <div className="h-3 w-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Loading probabilities...</span>
              </div>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => setSide('yes')}
                className={`flex-1 px-4 py-3 rounded-full font-semibold transition-all duration-200 ${side === 'yes'
                  ? 'bg-gradient-to-r from-[#facc15] to-[#fbbf24] text-[#0D0D0F] shadow-[0_0_20px_var(--glow-cyan)]'
                  : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--input-bg)]'
                  }`}
              >
                YES
              </button>
              <button
                onClick={() => setSide('no')}
                className={`flex-1 px-4 py-3 rounded-full font-semibold transition-all duration-200 ${side === 'no'
                  ? 'bg-gradient-to-r from-[#E879F9] to-[#F0ABFC] text-[#0D0D0F] shadow-[0_0_20px_var(--glow-magenta)]'
                  : 'bg-[var(--surface-hover)] text-[var(--text-secondary)] hover:bg-[var(--input-bg)]'
                  }`}
              >
                NO
              </button>
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
              Amount (USDC)
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.0"
              step="0.01"
              min="0"
              disabled={loading}
              className="w-full px-4 py-3 border border-[var(--border-color)] rounded-xl bg-[var(--input-bg)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:ring-2 focus:ring-white focus:border-transparent disabled:opacity-50 transition-all font-number"
            />

            {/* To Win Display */}
            {quotePreview?.estimatedTokens && (
              <div className="mt-2 flex items-center justify-between animate-fadeIn">
                <span className="text-sm text-[var(--text-secondary)]">To win</span>
                <span className="text-lg font-bold text-green-400 font-number">
                  ${quotePreview.estimatedTokens}
                </span>
              </div>
            )}
            {quotePreview?.estimatedSpendUsdc && (
              <div className="mt-2 flex items-center justify-between animate-fadeIn">
                <span className="text-sm text-[var(--text-secondary)]">Estimated spend</span>
                <span className="text-lg font-bold text-[var(--text-primary)] font-number">
                  ${quotePreview.estimatedSpendUsdc}
                </span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          {authenticated && (!ready || !walletAddress) && (
            <div className="mb-2 p-2 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
              <p className="text-yellow-400 text-xs">
                {!ready ? 'Initializing...' : !walletAddress ? 'Please connect your wallet' : ''}
              </p>
            </div>
          )}

          <button
            onClick={handlePlaceOrder}
            disabled={loading || !amount || parseFloat(amount) <= 0}
            className="w-full px-4 py-3 bg-white text-black rounded-xl hover:bg-white/90 disabled:bg-gray-600 disabled:text-white disabled:cursor-not-allowed transition-all font-semibold"
          >
            {loading ? 'Placing Order...' : !amount || parseFloat(amount) <= 0 ? 'Enter Amount' : authenticated ? 'Place Order' : 'Sign in to Trade'}
          </button>

          {/* Status */}
          {status && (
            <p className={`text-sm p-3 rounded-lg ${status.includes('✅')
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : status.includes('❌')
                ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-white/10 text-white border border-white/30'
              }`}>
              {status}
            </p>
          )}
        </div>
      </div>

      <TradeQuoteModal
        isOpen={showQuoteModal}
        onClose={() => {
          // Treat closing the modal as "Skip" so trade still gets stored.
          // This matches the desired flow: after tx success -> quote modal -> store trade (with/without quote).
          if (!isSubmittingQuote && pendingTradePayload) {
            handleQuoteSubmit('');
            return;
          }
          setShowQuoteModal(false);
          setPendingTradePayload(null);
        }}
        onSubmit={handleQuoteSubmit}
        tradeData={{
          market,
          side,
          budgetUsdc: amount,
          estimatedSpendUsdc: lastQuoteSummary?.estimatedSpendUsdc,
          estimatedTokens: lastQuoteSummary?.estimatedTokens,
          entryPrice: lastQuoteSummary?.entryPrice,
        }}
        isSubmitting={isSubmittingQuote}
      />
    </>
  );
}

