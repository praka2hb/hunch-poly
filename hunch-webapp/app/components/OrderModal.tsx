'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Image from 'next/image';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { Market, Event } from '../lib/api';
import { requestOrder, requestOrderPreview, getOrderStatus, OrderResponse, USDC_MINT } from '../lib/tradeApi';
import { useAuth } from './AuthContext';
import { useAppData } from '../contexts/AppDataContext';
import TradeQuoteModal from './TradeQuoteModal';

interface OrderModalProps {
    isOpen: boolean;
    onClose: () => void;
    market: Market;
    event: Event;
}

// Minimal Receipt Card Component
function ReceiptCard({
    event,
    market,
    selectedSide,
    amount,
    setAmount,
    toWinAmount,
    estimatedSpendUsdc,
    quoteReady,
    onPlaceOrder,
    loading,
    status,
    authenticated,
}: {
    event: Event;
    market: Market;
    selectedSide: 'yes' | 'no' | null;
    amount: string;
    setAmount: (val: string) => void;
    toWinAmount?: string;
    estimatedSpendUsdc?: string;
    quoteReady: boolean;
    onPlaceOrder: () => void;
    loading: boolean;
    status: string;
    authenticated: boolean;
}) {
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        if (selectedSide && inputRef.current) {
            inputRef.current.focus();
        }
    }, [selectedSide]);

    const isValidAmount = amount && parseFloat(amount) > 0;
    const buttonDisabled = loading || !isValidAmount || !quoteReady;

    return (
        <div
            className="bg-white rounded-b-2xl border-x-2 border-b-2 border-gray-800 w-full"
            onClick={(e) => e.stopPropagation()}
        >
            <div className="p-4">
                {/* Market & Event Info - Always visible */}
                <div className="text-center pb-3 border-b border-dashed border-gray-200">
                    <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wider mb-0.5">{event.title}</p>
                    <h3 className="text-xs font-bold text-gray-800 leading-tight line-clamp-2">{market.title}</h3>
                </div>

                {/* Input Section - Only visible when side is selected */}
                <AnimatePresence>
                    {selectedSide && (
                        <motion.div
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: 'auto' }}
                            exit={{ opacity: 0, height: 0 }}
                            transition={{ duration: 0.2 }}
                        >
                            {/* Selected side indicator */}
                            <div className="mt-3 mb-3 flex justify-center">
                                <span className={`text-xs font-semibold px-3 py-1 rounded-full ${selectedSide === 'yes'
                                    ? 'bg-white-100 text-white'
                                    : 'bg-pink-100 text-pink-600'
                                    }`}>
                                    Betting {selectedSide.toUpperCase()}
                                </span>
                            </div>

                            {/* Amount Input */}
                            <div className="mb-3">
                                <div className="relative">
                                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-lg font-semibold">$</span>
                                    <input
                                        ref={inputRef}
                                        type="number"
                                        value={amount}
                                        onChange={(e) => setAmount(e.target.value)}
                                        placeholder="0.00"
                                        step="0.01"
                                        min="0"
                                        disabled={loading}
                                        className="w-full pl-8 pr-3 py-3 border-2 border-gray-300 rounded-xl bg-gray-50 text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-gray-400 focus:border-gray-500 disabled:opacity-50 transition-all font-mono text-xl font-bold"
                                    />
                                </div>
                            </div>

                            <AnimatePresence>
                                {estimatedSpendUsdc && toWinAmount && (
                                    <motion.div
                                        className="mb-3 px-3 py-2 bg-gray-100 rounded-lg border border-gray-200"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex flex-col">
                                                <span className="text-[10px] font-medium text-gray-600">Total spend</span>
                                                <span className="text-base font-bold text-gray-800 font-mono">${estimatedSpendUsdc}</span>
                                            </div>
                                            <div className="flex flex-col text-right">
                                                <span className="text-[10px] font-medium text-green-600">To win</span>
                                                <span className="text-base font-bold text-green-600 font-mono">${toWinAmount}</span>
                                            </div>
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            {/* Place Order Button */}
                            <button
                                onClick={onPlaceOrder}
                                disabled={buttonDisabled}
                                className={`
                                    w-full py-3 rounded-xl font-bold text-sm transition-all duration-200 
                                    ${buttonDisabled
                                        ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                        : 'bg-gray-900 text-white hover:bg-black active:scale-[0.98]'
                                    }
                                `}
                            >
                                {loading
                                    ? 'Placing...'
                                    : !isValidAmount
                                        ? 'Enter Amount'
                                        : !quoteReady
                                            ? 'Fetching Quote...'
                                            : authenticated
                                                ? 'Place Trade'
                                                : 'Sign in'}
                            </button>

                            {/* Status Message */}
                            <AnimatePresence>
                                {status && (
                                    <motion.p
                                        className={`mt-2 text-xs text-center font-medium ${status.includes('✅') ? 'text-green-600'
                                            : status.includes('❌') ? 'text-red-500'
                                                : 'text-blue-500'
                                            }`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                    >
                                        {status}
                                    </motion.p>
                                )}
                            </AnimatePresence>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>
        </div>
    );
}

export default function OrderModal({ isOpen, onClose, market, event }: OrderModalProps) {
    // Auth & wallet hooks
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const { currentUserId, triggerPositionsRefresh } = useAppData();
    const { requireAuth } = useAuth();

    // Connection for sending transactions - use useMemo to avoid recreating
    const primaryRpcUrl =
        process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com';
    const connection = useRef(new Connection(primaryRpcUrl, 'confirmed')).current;
    const fallbackConnection = useRef(
        primaryRpcUrl === 'https://api.mainnet-beta.solana.com'
            ? null
            : new Connection('https://api.mainnet-beta.solana.com', 'confirmed')
    ).current;

    // Modal state - simplified, no phases
    const [selectedSide, setSelectedSide] = useState<'yes' | 'no' | null>(null);

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
    const [quoteError, setQuoteError] = useState<string | null>(null);
    const [lastQuoteSummary, setLastQuoteSummary] = useState<{
        estimatedSpendUsdc?: string;
        estimatedTokens?: string;
        entryPrice?: string;
    } | null>(null);

    const solanaWallet = wallets[0];
    const walletAddress = solanaWallet?.address;

    // Reset state when modal opens
    useEffect(() => {
        if (isOpen) {
            setSelectedSide(null);
            setAmount('');
            setStatus('');
            setLoading(false);
        }
    }, [isOpen]);

    // Handle pill selection - simple toggle
    const handlePillSelect = (side: 'yes' | 'no') => {
        setSelectedSide(side);
    };

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

    const quoteRequestRef = useRef(0);

    useEffect(() => {
        if (!amount || parseFloat(amount) <= 0 || !selectedSide) {
            setQuotePreview(null);
            setQuoteError(null);
            return;
        }
        if (market.status !== 'active') {
            setQuotePreview(null);
            setQuoteError(null);
            return;
        }

        const outputMint = getMintAddress(selectedSide);
        if (!outputMint) {
            setQuotePreview(null);
            setQuoteError('Unable to find market token mint');
            return;
        }

        const requestId = ++quoteRequestRef.current;

        const fetchQuote = async () => {
            try {
                const amountInSmallestUnit = Math.floor(parseFloat(amount) * 1_000_000).toString();
                const orderResponse = await requestOrderPreview({
                    inputMint: USDC_MINT,
                    outputMint,
                    amount: amountInSmallestUnit,
                });

                if (requestId !== quoteRequestRef.current) return;

                setQuoteError(null);
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
            } catch (error: any) {
                if (requestId === quoteRequestRef.current) {
                    setQuotePreview(null);
                    const rawMessage = error?.message || 'Quote failed';
                    const lowAmount = rawMessage.toLowerCase().includes('zero out amount');
                    setQuoteError(lowAmount ? 'Amount too low for a valid quote' : rawMessage);
                }
            }
        };

        fetchQuote();
    }, [amount, market.status, selectedSide]);

    // Place order handler
    const handlePlaceOrder = async () => {
        if (!authenticated) {
            requireAuth('Sign in to place your trade');
            return;
        }

        if (!ready || !walletAddress || !user || !selectedSide) {
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

        const outputMint = getMintAddress(selectedSide);
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

                setStatus('Signing transaction...');

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
                const sendWithConnection = (conn: Connection) =>
                    conn.sendTransaction(signedTransaction, {
                        skipPreflight: true,
                        maxRetries: 3,
                    });

                let signature: string;
                try {
                    signature = await sendWithConnection(connection);
                } catch (sendError: any) {
                    const message = String(sendError?.message || '');
                    const isNetworkAbort =
                        message.includes('signal is aborted') ||
                        message.includes('failed to fetch') ||
                        message.includes('NetworkError');

                    if (!fallbackConnection || !isNetworkAbort) {
                        throw sendError;
                    }

                    console.warn('[OrderModal] Primary RPC failed, retrying with fallback.');
                    signature = await sendWithConnection(fallbackConnection);
                }

                return { orderResponse, signatureString: signature };
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

            setStatus('Transaction confirmed!');

            if (!currentUserId) {
                throw new Error('User not synced. Please refresh and try again.');
            }

            // Handle async execution mode - reduced polling time
            if (orderResponse.executionMode === 'async') {
                setStatus('⏳ Order is processing...');
                const maxAsyncAttempts = 20;
                let asyncAttempts = 0;
                while (asyncAttempts < maxAsyncAttempts) {
                    const st = await getOrderStatus(signatureString);
                    if (st.status === 'closed') break;
                    if (st.status === 'failed') {
                        throw new Error('Trade execution failed');
                    }
                    asyncAttempts++;
                    await new Promise((r) => setTimeout(r, 1500));
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
                side: selectedSide,
                action: 'BUY',
                amount: spentUsdc.toFixed(6), // Store actual inAmount (USDC spent)
                executedInAmount: orderResponse.inAmount || null, // Actual USDC spent (in smallest unit)
                executedOutAmount: orderResponse.outAmount || null, // Actual tokens received (in smallest unit)
                transactionSig: signatureString,
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
            } else if (error.message?.includes('signal is aborted')) {
                errorMessage = 'RPC request aborted. Please retry.';
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

            // Trigger global positions refresh
            triggerPositionsRefresh();

            setTimeout(() => {
                onClose();
            }, 1500);
        } catch (error: any) {
            setStatus(`❌ Error: ${error.message}`);
        } finally {
            setIsSubmittingQuote(false);
        }
    };

    // Handle modal close
    const handleClose = () => {
        if (showQuoteModal && pendingTradePayload) {
            handleQuoteSubmit('');
            return;
        }
        onClose();
    };

    return (
        <>
            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        className="fixed inset-0 z-50 flex items-end justify-center"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                    >
                        {/* Backdrop */}
                        <motion.div
                            className="absolute inset-0 bg-black/60 backdrop-blur-md"
                            onClick={handleClose}
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                        />

                        {/* Combined Cat + Receipt View */}
                        <motion.div
                            className="absolute bottom-0 w-full z-10 flex flex-col items-center"
                            initial={{ y: '100%' }}
                            animate={{ y: 0 }}
                            exit={{ y: '100%' }}
                            transition={{ type: "spring", damping: 25, stiffness: 300 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            {/* Cat Container - Reduced Size */}
                            <div className="relative w-full max-w-[320px] mx-auto">
                                <div className="relative w-full aspect-square">
                                    <Image
                                        src="/pillcat2.png"
                                        alt="Choose your pill"
                                        fill
                                        className="object-contain drop-shadow-2xl"
                                        priority
                                    />

                                    {/* Interactive Pill Buttons - Lighter by default, highlighted when selected */}
                                    <div className="absolute inset-0 pointer-events-none">
                                        {/* YES Pill (Left Hand) */}
                                        <motion.button
                                            onClick={() => handlePillSelect('yes')}
                                            className="absolute pointer-events-auto group"
                                            style={{
                                                bottom: 'calc(32% + 20px)',
                                                left: 'calc(6% - 16px)',
                                            }}
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            whileHover={{ scale: 1.05, y: -2 }}
                                            whileTap={{ scale: 0.95 }}
                                            transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 15 }}
                                        >
                                            <div className={`
                                                relative flex items-center justify-center w-20 h-9 sm:w-24 sm:h-10 
                                                rounded-full transition-all duration-200
                                                ${selectedSide === 'yes'
                                                    ? 'bg-white border-2 border-white shadow-[0_0_20px_rgba(6,182,212,0.6)]'
                                                    : 'bg-white-100 border-2 border-white/60 hover:bg-gray-200 hover:border-white'
                                                }
                                            `}>
                                                <span className={`
                                                    font-bold text-sm sm:text-base tracking-wide
                                                    ${selectedSide === 'yes'
                                                        ? 'text-white'
                                                        : 'text-white'
                                                    }
                                                `}>YES</span>
                                            </div>
                                        </motion.button>

                                        {/* NO Pill (Right Hand) */}
                                        <motion.button
                                            onClick={() => handlePillSelect('no')}
                                            className="absolute pointer-events-auto group"
                                            style={{
                                                bottom: 'calc(32% + 20px)',
                                                right: 'calc(6% - 16px)',
                                            }}
                                            initial={{ opacity: 0, scale: 0 }}
                                            animate={{ opacity: 1, scale: 1 }}
                                            whileHover={{ scale: 1.05, y: -2 }}
                                            whileTap={{ scale: 0.95 }}
                                            transition={{ delay: 0.3, type: "spring", stiffness: 300, damping: 15 }}
                                        >
                                            <div className={`
                                                relative flex items-center justify-center w-20 h-9 sm:w-24 sm:h-10 
                                                rounded-full transition-all duration-200
                                                ${selectedSide === 'no'
                                                    ? 'bg-pink-500 border-2 border-pink-300 shadow-[0_0_20px_rgba(236,72,153,0.6)]'
                                                    : 'bg-pink-100 border-2 border-pink-300/60 hover:bg-pink-200 hover:border-pink-400'
                                                }
                                            `}>
                                                <span className={`
                                                    font-bold text-sm sm:text-base tracking-wide
                                                    ${selectedSide === 'no'
                                                        ? 'text-white'
                                                        : 'text-pink-600'
                                                    }
                                                `}>NO</span>
                                            </div>
                                        </motion.button>
                                    </div>
                                </div>
                            </div>

                            {/* Receipt - Always visible, attached directly below cat */}
                            <div className="w-full max-w-[320px] mx-auto -mt-12">
                                <ReceiptCard
                                    event={event}
                                    market={market}
                                    selectedSide={selectedSide}
                                    amount={amount}
                                    setAmount={setAmount}
                                    toWinAmount={quotePreview?.estimatedTokens}
                                    estimatedSpendUsdc={quotePreview?.estimatedSpendUsdc}
                                    quoteReady={!!quotePreview?.estimatedSpendUsdc && !!quotePreview?.estimatedTokens}
                                    onPlaceOrder={handlePlaceOrder}
                                    loading={loading}
                                    status={status}
                                    authenticated={authenticated}
                                />
                                {quoteError && (
                                    <div className="mt-2 text-xs text-red-600 text-center">
                                        {quoteError}
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </motion.div>
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
                    side: selectedSide || 'yes',
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
