'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Market, EventDetails } from '../lib/api';
import { requestOrder, getOrderStatus, OrderResponse, USDC_MINT } from '../lib/tradeApi';
import { useAuth } from './AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import TradeQuoteModal from './TradeQuoteModal';

interface TradeDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    market: Market;
    event: EventDetails | null;
    initialSide: 'yes' | 'no'; // Pre-filled side from the post
}

export default function TradeDrawer({ isOpen, onClose, market, event, initialSide }: TradeDrawerProps) {
    // Auth & wallet hooks
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const { currentUserId } = useAppData();
    const { requireAuth } = useAuth();

    // Connection for sending transactions
    const connection = new Connection(
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
        'confirmed'
    );

    // Trade state
    const [amount, setAmount] = useState('');
    const [loading, setLoading] = useState(false);
    const [status, setStatus] = useState('');

    // Quote modal state
    const [showQuoteModal, setShowQuoteModal] = useState(false);
    const [pendingTradePayload, setPendingTradePayload] = useState<any | null>(null);
    const [isSubmittingQuote, setIsSubmittingQuote] = useState(false);
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

    const solanaWallet = wallets[0];
    const walletAddress = solanaWallet?.address;
    const inputRef = useRef<HTMLInputElement>(null);

    // Reset state when drawer opens
    useEffect(() => {
        if (isOpen) {
            setAmount('');
            setStatus('');
            setLoading(false);
            // Focus input after animation
            setTimeout(() => {
                inputRef.current?.focus();
            }, 300);
        }
    }, [isOpen]);

    // Get mint address helper
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
        return type === 'yes' ? market.yesMint : market.noMint;
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

        const outputMint = getMintAddress(initialSide);
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
    }, [amount, walletAddress, market.status, initialSide]);

    // Place order handler
    const handlePlaceOrder = async () => {
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

        const outputMint = getMintAddress(initialSide);
        if (!outputMint) {
            setStatus('❌ Unable to find market token mint address');
            return;
        }

        setLoading(true);
        setStatus('Requesting order...');

        try {
            const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000).toString();

            const attemptOrder = async () => {
                const orderResponse: OrderResponse = await requestOrder({
                    userPublicKey: walletAddress,
                    inputMint: USDC_MINT,
                    outputMint: outputMint,
                    amount: amountInSmallestUnit,
                    slippageBps: 100,
                });

                setStatus('Signing transaction...');

                const transactionBase64 = orderResponse.transaction || orderResponse.openTransaction;
                if (!transactionBase64) {
                    throw new Error('No transaction found in order response');
                }

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

                setStatus('Sending transaction...');

                const signedTransaction = VersionedTransaction.deserialize(signedTxBytes);
                const signature = await connection.sendTransaction(signedTransaction, {
                    skipPreflight: true,
                    maxRetries: 3,
                });

                return { orderResponse, signature };
            };

            let orderResponse: OrderResponse;
            let signature: string;
            try {
                ({ orderResponse, signature } = await attemptOrder());
            } catch (error: any) {
                const msg = (error?.message || '').toLowerCase();
                const shouldRetry =
                    msg.includes('transaction simulation failed') ||
                    msg.includes('blockhash not found');
                if (!shouldRetry) throw error;
                setStatus('Refreshing quote and retrying...');
                ({ orderResponse, signature } = await attemptOrder());
            }

            setStatus('Transaction submitted! Confirming...');

            // Wait for confirmation
            const maxAttempts = 30;
            let attempts = 0;
            let confirmationStatus;

            while (attempts < maxAttempts) {
            const statusResult = await connection.getSignatureStatuses([signature]);
                confirmationStatus = statusResult.value[0];

                if (confirmationStatus?.err) {
                    throw new Error(`Transaction failed: ${JSON.stringify(confirmationStatus.err)}`);
                }

                if (confirmationStatus &&
                    (confirmationStatus.confirmationStatus === 'confirmed' ||
                        confirmationStatus.confirmationStatus === 'finalized')) {
                    break;
                }

                await new Promise((resolve) => setTimeout(resolve, 1000));
                attempts++;
            }

            if (attempts >= maxAttempts) {
                throw new Error('Transaction confirmation timeout');
            }

            if (!confirmationStatus ||
                (confirmationStatus.confirmationStatus !== 'confirmed' &&
                    confirmationStatus.confirmationStatus !== 'finalized')) {
                throw new Error('Transaction not confirmed');
            }

            setStatus('Transaction confirmed!');

            if (!currentUserId) {
                throw new Error('User not synced. Please refresh and try again.');
            }

            // Handle async execution mode
            if (orderResponse.executionMode === 'async') {
                setStatus('⏳ Order is processing...');
                const maxAsyncAttempts = 45;
                let asyncAttempts = 0;
                while (asyncAttempts < maxAsyncAttempts) {
                    const st = await getOrderStatus(signature);
                    if (st.status === 'closed') break;
                    if (st.status === 'failed') {
                        throw new Error('Trade execution failed');
                    }
                    asyncAttempts++;
                    await new Promise((r) => setTimeout(r, 2000));
                }
                if (asyncAttempts >= maxAsyncAttempts) {
                    throw new Error('Trade still processing. Please check again.');
                }
            }

            // Calculate entry price
            const spentUsdc = orderResponse.inAmount
                ? Number(orderResponse.inAmount) / 1_000_000
                : Number(amountInSmallestUnit) / 1_000_000;

            const receivedTokens = orderResponse.outAmount
                ? Number(orderResponse.outAmount) / 1_000_000
                : null;

            let entryPrice: number | null = null;
            if (spentUsdc && receivedTokens && receivedTokens > 0) {
                entryPrice = spentUsdc / receivedTokens;
            }

            setLastQuoteSummary({
                estimatedSpendUsdc: spentUsdc?.toFixed(6),
                estimatedTokens: receivedTokens?.toFixed(6),
                entryPrice: entryPrice?.toFixed(10),
            });

            const tradePayload = {
                userId: currentUserId,
                marketTicker: market.ticker,
                eventTicker: market.eventTicker || null,
                side: initialSide,
                amount: spentUsdc.toFixed(6), // Store actual inAmount (USDC spent)
                transactionSig: signature,
                entryPrice: entryPrice?.toString() || null,
            };

            setPendingTradePayload(tradePayload);
            setStatus('✅ Trade executed successfully!');
            setLoading(false);
            setShowQuoteModal(true);
        } catch (error: any) {
            let errorMessage = error.message || 'Unknown error occurred';
            if (error.message?.includes('User rejected')) {
                errorMessage = 'Transaction was cancelled';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient USDC balance';
            }
            setStatus(`❌ Error: ${errorMessage}`);
            setLoading(false);
        }
    };

    // Handle quote submit
    const handleQuoteSubmit = async (quote: string) => {
        if (!pendingTradePayload) return;
        setIsSubmittingQuote(true);

        try {
            const finalQuote = quote.trim();
            const payloadToStore = {
                ...pendingTradePayload,
                ...(finalQuote ? { quote: finalQuote } : {}),
            };

            const response = await fetch('/api/trades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payloadToStore),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to store trade');
            }

            setShowQuoteModal(false);
            setPendingTradePayload(null);
            setAmount('');
            setStatus(finalQuote ? '✅ Trade shared!' : '✅ Trade saved!');

            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error: any) {
            setStatus(`❌ Error: ${error.message}`);
        } finally {
            setIsSubmittingQuote(false);
        }
    };

    const isValidAmount = amount && parseFloat(amount) > 0;
    const buttonDisabled = loading || !isValidAmount;

    // Get market label
    const marketLabel = initialSide === 'yes'
        ? (market.yesSubTitle || 'Yes')
        : (market.noSubTitle || 'No');

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <>
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={onClose}
                            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
                        />

                        {/* Drawer */}
                        <motion.div
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
                            className="fixed bottom-0 left-0 right-0 bg-[var(--card-bg)] border-t-2 border-[var(--border-color)] rounded-t-3xl z-50 max-h-[90vh] overflow-y-auto"
                            style={{
                                boxShadow: '0 -4px 24px rgba(0,0,0,0.2)',
                            }}
                        >
                            {/* Handle bar */}
                            <div className="flex justify-center pt-3 pb-2">
                                <div className="w-12 h-1.5 bg-[var(--border-color)] rounded-full" />
                            </div>

                            <div className="px-6 pb-6">
                                {/* Header */}
                                <div className="mb-6">
                                    <h2 className="text-2xl font-bold text-[var(--text-primary)] mb-2">
                                        Place Trade
                                    </h2>
                                    <div className="space-y-1">
                                        <p className="text-sm text-[var(--text-secondary)]">
                                            {event?.title || market.title}
                                        </p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-lg font-bold ${initialSide === 'yes' ? 'text-[#22C55E]' : 'text-[#EF4444]'}`}>
                                                {initialSide.toUpperCase()}
                                            </span>
                                            <span className="text-[var(--text-tertiary)]">on</span>
                                            <span className="text-sm font-semibold text-[var(--text-primary)]">
                                                {marketLabel}
                                            </span>
                                        </div>
                                    </div>
                                </div>

                                {/* Amount Input */}
                                <div className="mb-4">
                                    <label className="block text-sm font-medium text-[var(--text-secondary)] mb-2">
                                        Amount (USDC)
                                    </label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-primary)] text-xl font-semibold">$</span>
                                        <input
                                            ref={inputRef}
                                            type="number"
                                            value={amount}
                                            onChange={(e) => setAmount(e.target.value)}
                                            placeholder="0.00"
                                            step="0.01"
                                            min="0"
                                            disabled={loading}
                                            className="w-full pl-10 pr-4 py-4 border-2 border-[var(--border-color)] rounded-xl bg-[var(--surface)] text-[var(--text-primary)] placeholder-[var(--text-tertiary)] focus:ring-2 focus:ring-[#FFD93D] focus:border-[#FFD93D] disabled:opacity-50 transition-all font-mono text-2xl font-bold"
                                        />
                                    </div>
                                </div>

                                {/* To Win */}
                                <AnimatePresence>
                                    {quotePreview?.estimatedTokens && (
                                        <motion.div
                                            className="mb-4 px-4 py-3 bg-[#22C55E]/10 rounded-xl border border-[#22C55E]/30"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-[#22C55E]">To win</span>
                                                <span className="text-xl font-bold text-[#22C55E] font-mono">
                                                    ${quotePreview.estimatedTokens}
                                                </span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                                <AnimatePresence>
                                    {quotePreview?.estimatedSpendUsdc && (
                                        <motion.div
                                            className="mb-4 px-4 py-3 bg-[var(--surface-hover)] rounded-xl border border-[var(--border-color)]"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                        >
                                            <div className="flex items-center justify-between">
                                                <span className="text-sm font-medium text-[var(--text-secondary)]">Estimated spend</span>
                                                <span className="text-xl font-bold text-[var(--text-primary)] font-mono">
                                                    ${quotePreview.estimatedSpendUsdc}
                                                </span>
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>

                                {/* Place Order Button */}
                                <button
                                    onClick={handlePlaceOrder}
                                    disabled={buttonDisabled}
                                    className={`
                                        w-full py-4 rounded-xl font-bold text-lg transition-all duration-200 mb-4
                                        ${buttonDisabled
                                            ? 'bg-[var(--surface-hover)] text-[var(--text-tertiary)] cursor-not-allowed'
                                            : 'bg-yellow-300 text-black hover:bg-yellow-400 active:scale-[0.98] border-2 border-black'
                                        }
                                    `}
                                >
                                    {loading
                                        ? 'Placing...'
                                        : !isValidAmount
                                            ? 'Enter Amount'
                                            : authenticated
                                                ? 'Place Order'
                                                : 'Sign in'}
                                </button>

                                {/* Status Message */}
                                <AnimatePresence>
                                    {status && (
                                        <motion.p
                                            className={`text-sm text-center font-medium ${
                                                status.includes('✅') ? 'text-[#22C55E]'
                                                    : status.includes('❌') ? 'text-[#EF4444]'
                                                        : 'text-[var(--text-secondary)]'
                                            }`}
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                            exit={{ opacity: 0 }}
                                        >
                                            {status}
                                        </motion.p>
                                    )}
                                </AnimatePresence>
                            </div>
                        </motion.div>
                    </>
                )}
            </AnimatePresence>

            {/* Quote Modal */}
            <TradeQuoteModal
                isOpen={showQuoteModal}
                onClose={() => {
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
                    side: initialSide,
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

