'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, VersionedTransaction } from '@solana/web3.js';
import { fetchEventDetails, fetchMarketDetails, EventDetails, Market } from '../../lib/api';
import TradeMarket from '../../components/TradeMarket';
import ShareBlink from '../../components/ShareBlink';
import EventDetailChart from '../../components/EventDetailChart';
import { useAuth } from '../../components/AuthContext';
import { requestOrder, getOrderStatus, OrderResponse, USDC_MINT } from '../../lib/tradeApi';
import { normalizeTwitterAvatarUrl } from '@/lib/utils';

export default function EventPage() {
    const params = useParams();
    const router = useRouter();
    const { ready, authenticated, user } = usePrivy();
    const { wallets } = useWallets();
    const { signTransaction } = useSignTransaction();
    const { requireAuth } = useAuth();
    const eventId = params?.eventId as string;
    const [eventDetails, setEventDetails] = useState<EventDetails | null>(null);
    const [detailedMarkets, setDetailedMarkets] = useState<Map<string, Market>>(new Map());
    const [loadingMarkets, setLoadingMarkets] = useState<Set<string>>(new Set());
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedMarketTicker, setSelectedMarketTicker] = useState<string | null>(null);
    const [showAllMarkets, setShowAllMarkets] = useState(false);
    const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
    const [isMobileView, setIsMobileView] = useState(false);
    const [mobileTradeOpen, setMobileTradeOpen] = useState(false);

    // Mobile trade state
    const [mobileAmount, setMobileAmount] = useState('');
    const [mobileTradeLoading, setMobileTradeLoading] = useState(false);
    const [mobileTradeStatus, setMobileTradeStatus] = useState('');

    const solanaWallet = wallets[0];
    const walletAddress = solanaWallet?.address;

    useEffect(() => {
        if (!eventId) return;

        const loadEventDetails = async () => {
            try {
                setLoading(true);
                setError(null);
                const details = await fetchEventDetails(eventId);
                setEventDetails(details);
                console.debug('Event imageUrl:', details?.imageUrl, details?.image_url, details?.featured_image_url);
                console.debug('Markets received:', {
                    count: details?.markets?.length || 0,
                    statuses: details?.markets?.map((m: any) => m.status) || [],
                });

                // Fetch detailed info for each market
                if (details.markets && details.markets.length > 0) {
                    const activeMarkets = details.markets.filter(
                        (m: Market) => m.status !== 'finalized' && m.status !== 'resolved' && m.status !== 'closed'
                    );

                    // Set first market as selected by default
                    if (activeMarkets.length > 0 && activeMarkets[0].ticker) {
                        setSelectedMarketTicker(activeMarkets[0].ticker);
                    }

                    // Fetch detailed market info for each active market
                    activeMarkets.forEach(async (market: Market) => {
                        if (market.ticker) {
                            setLoadingMarkets(prev => new Set(prev).add(market.ticker));
                            try {
                                const detailedMarket = await fetchMarketDetails(market.ticker);
                                if ((detailedMarket as any)?.imageUrl) {
                                    console.debug('Market imageUrl', market.ticker, (detailedMarket as any).imageUrl);
                                }
                                setDetailedMarkets(prev => {
                                    const newMap = new Map(prev);
                                    newMap.set(market.ticker, detailedMarket);
                                    return newMap;
                                });
                            } catch (err) {
                                console.error(`Failed to fetch details for market ${market.ticker}:`, err);
                                setDetailedMarkets(prev => {
                                    const newMap = new Map(prev);
                                    if (!newMap.has(market.ticker)) {
                                        newMap.set(market.ticker, market);
                                    }
                                    return newMap;
                                });
                            } finally {
                                setLoadingMarkets(prev => {
                                    const newSet = new Set(prev);
                                    newSet.delete(market.ticker);
                                    return newSet;
                                });
                            }
                        }
                    });
                }
            } catch (err: any) {
                setError(err.message || 'Failed to load event details');
                console.error('Error loading event details:', err);
            } finally {
                setLoading(false);
            }
        };

        loadEventDetails();
    }, [eventId]);

    // Detect mobile view for trade modal behavior
    useEffect(() => {
        const handleResize = () => {
            if (typeof window !== 'undefined') {
                setIsMobileView(window.innerWidth < 1024); // lg breakpoint
            }
        };
        handleResize();
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // Close mobile trade modal when leaving mobile view
    useEffect(() => {
        if (!isMobileView) {
            setMobileTradeOpen(false);
        }
    }, [isMobileView]);

    // Get active markets and sort by chance (yesBid) descending
    const activeMarkets = (eventDetails?.markets?.filter(
        (m: Market) => m.status !== 'finalized' && m.status !== 'resolved' && m.status !== 'closed'
    ) || []).sort((a, b) => {
        const aChance = a.yesBid ? parseFloat(a.yesBid) : 0;
        const bChance = b.yesBid ? parseFloat(b.yesBid) : 0;
        return bChance - aChance; // Descending order
    });

    // Show only top 4 markets initially
    const displayedMarkets = showAllMarkets ? activeMarkets : activeMarkets.slice(0, 4);

    // Get selected market data
    const selectedMarket = selectedMarketTicker
        ? (detailedMarkets.get(selectedMarketTicker) || activeMarkets.find(m => m.ticker === selectedMarketTicker))
        : activeMarkets[0];

    const formatDate = (timestamp?: number) => {
        if (!timestamp) return null;
        return new Date(timestamp * 1000).toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        });
    };

    // Get mint address for YES or NO token
    const getMintAddress = (market: Market, type: 'yes' | 'no'): string | undefined => {
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

    // Mobile trade handler - Real trades
    const handleMobileTrade = async () => {
        if (!authenticated) {
            requireAuth('Sign in to place your trade');
            return;
        }

        if (!ready || !walletAddress || !user || !solanaWallet) {
            setMobileTradeStatus('Please connect your wallet first');
            return;
        }

        if (!mobileAmount || parseFloat(mobileAmount) <= 0) {
            setMobileTradeStatus('Please enter a valid amount');
            return;
        }

        if (!selectedMarket || selectedMarket.status !== 'active') {
            setMobileTradeStatus('Market is not active');
            return;
        }

        // Get mint address
        const outputMint = getMintAddress(selectedMarket, selectedSide);
        if (!outputMint) {
            setMobileTradeStatus('❌ Unable to find market token');
            return;
        }

        setMobileTradeLoading(true);
        setMobileTradeStatus('Requesting order...');

        try {
            // Convert amount to smallest unit (USDC has 6 decimals)
            const amountInSmallestUnit = Math.floor(parseFloat(mobileAmount) * 1_000_000).toString();

            // Request order from DFlow API
            const orderResponse: OrderResponse = await requestOrder({
                userPublicKey: walletAddress,
                inputMint: USDC_MINT,
                outputMint: outputMint,
                amount: amountInSmallestUnit,
                slippageBps: 100, // 1% slippage
            });

            setMobileTradeStatus('Signing transaction...');

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

            setMobileTradeStatus('Sending transaction...');

            // Create Solana connection for sending transactions
            const connection = new Connection(
                process.env.NEXT_PUBLIC_RPC_URL || 'https://api.mainnet-beta.solana.com',
                'confirmed'
            );

            // Create VersionedTransaction from signed bytes and send it
            const signedTransaction = VersionedTransaction.deserialize(signedTxBytes);

            // Send the signed transaction to the network
            const signature = await connection.sendTransaction(signedTransaction, {
                skipPreflight: true, // Skip simulation for DFlow transactions
                maxRetries: 3,
            });

            // connection.sendTransaction returns a Promise<string> with base58 signature
            const signatureString = signature;

            setMobileTradeStatus('Transaction submitted! Confirming...');

            // Wait for transaction confirmation before storing trade
            let confirmationStatus;
            if (orderResponse.executionMode === 'sync') {
                // For sync trades, wait for confirmation
                const maxAttempts = 30;
                let attempts = 0;

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
            } else {
                // For async trades, just wait a bit for initial submission
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }

            setMobileTradeStatus('Transaction confirmed! Storing trade...');

            // Sync user
            const normalizedAvatarUrl = normalizeTwitterAvatarUrl(user.twitter?.profilePictureUrl);
            const syncResponse = await fetch('/api/users/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    privyId: user.id,
                    walletAddress: walletAddress,
                    displayName: user.twitter?.username
                        ? `@${user.twitter.username}`
                        : user.google?.email?.split('@')[0] || null,
                    avatarUrl: normalizedAvatarUrl,
                }),
            });

            if (!syncResponse.ok) throw new Error('Failed to sync user');
            const syncedUser = await syncResponse.json();

            // Create trade
            const tradeResponse = await fetch('/api/trades', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId: syncedUser.id,
                    marketTicker: selectedMarket.ticker,
                    eventTicker: selectedMarket.eventTicker || null,
                    side: selectedSide,
                    amount: mobileAmount, // Store in dollars (user input)
                    transactionSig: signatureString,
                }),
            });

            if (!tradeResponse.ok) {
                const errorData = await tradeResponse.json();
                throw new Error(errorData.error || 'Failed to create trade');
            }

            setMobileTradeStatus('✅ Order placed!');
            setMobileAmount('');
            setTimeout(() => setMobileTradeStatus(''), 3000);
        } catch (error: any) {
            // Enhanced error handling for transaction failures
            let errorMessage = error.message || 'Unknown error occurred';

            // Check for specific Solana errors
            if (error.message?.includes('Transaction simulation failed')) {
                errorMessage = 'Transaction simulation failed. This may be due to insufficient balance, expired blockhash, or invalid transaction. Please try again.';
            } else if (error.message?.includes('User rejected')) {
                errorMessage = 'Transaction was cancelled';
            } else if (error.message?.includes('insufficient funds')) {
                errorMessage = 'Insufficient USDC balance. Please ensure you have enough USDC in your wallet.';
            }

            setMobileTradeStatus(`❌ ${errorMessage}`);
        } finally {
            setMobileTradeLoading(false);
        }
    };

    // Loading state
    if (loading) {
        return (
            <div className="min-h-screen bg-[var(--background)]">
                <main className="max-w-7xl mx-auto px-4 py-8 pb-24">
                    <div className="space-y-4">
                        <div className="h-24 bg-[var(--surface)] rounded-2xl animate-pulse" />
                        <div className="flex gap-6">
                            <div className="flex-1 space-y-3">
                                {[1, 2, 3].map(i => (
                                    <div key={i} className="h-20 bg-[var(--surface)] rounded-xl animate-pulse" />
                                ))}
                            </div>
                            <div className="w-[35%]">
                                <div className="h-96 bg-[var(--surface)] rounded-2xl animate-pulse" />
                            </div>
                        </div>
                    </div>
                </main>
            </div>
        );
    }

    // Error state
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
                    <button onClick={() => router.back()} className="px-4 py-2 bg-white text-white rounded-xl text-sm font-medium">
                        Go Back
                    </button>
                </div>
            </div>
        );
    }

    if (!eventDetails) return null;

    const eventImageUrl =
        (eventDetails as any)?.image_url ||
        (eventDetails as any)?.featured_image_url ||
        eventDetails.imageUrl;

    return (
        <div className="min-h-screen bg-[var(--background)]">
            <main className="max-w-7xl mx-auto px-4 py-6 pb-8">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center gap-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)] mb-4 transition-colors"
                >
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                    <span className="text-sm font-medium">Back</span>
                </button>

                {/* Two Column Layout - Event Info + Markets on Left, Trade Card on Right */}
                <div className="flex flex-col lg:flex-row gap-6">
                    {/* Left Column - Event Info + Markets List (65%) */}
                    <div className="flex-1 lg:w-[65%] space-y-4">
                        {/* Event Header - Image + Title */}
                        <div className="flex gap-4 p-4 bg-[var(--surface)] rounded-2xl">
                            {/* Image Thumbnail */}
                            {eventImageUrl ? (
                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl overflow-hidden flex-shrink-0">
                                    <img
                                        src={eventImageUrl}
                                        alt={eventDetails.title}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                            ) : (
                                <div className="w-20 h-20 md:w-24 md:h-24 rounded-xl bg-gradient-to-br from-white/20 to-gray-400/20 flex items-center justify-center flex-shrink-0">
                                    <span className="text-2xl">📊</span>
                                </div>
                            )}

                            {/* Event Info */}
                            <div className="flex-1 min-w-0 flex flex-col justify-center">
                                <h1 className="text-lg md:text-xl font-bold text-[var(--text-primary)] leading-tight">
                                    {eventDetails.title}
                                </h1>
                                {eventDetails.subtitle && (
                                    <p className="text-[var(--text-secondary)] text-sm mt-1">{eventDetails.subtitle}</p>
                                )}
                            </div>
                        </div>

                        {/* Price Chart Section */}
                        {activeMarkets.length > 0 && (
                            <div className="bg-[var(--surface)] rounded-2xl p-4">
                                <h2 className="text-sm font-semibold text-[var(--text-tertiary)] uppercase tracking-wide mb-3">
                                    Price History
                                </h2>
                                <EventDetailChart
                                    eventTicker={eventId}
                                    markets={activeMarkets}
                                    selectedMarketTicker={selectedMarketTicker}
                                    onMarketSelect={setSelectedMarketTicker}
                                />
                            </div>
                        )}

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
                                displayedMarkets.map((market: Market) => {
                                    const marketData = detailedMarkets.get(market.ticker) || market;
                                    const isSelected = selectedMarketTicker === market.ticker;
                                    const isLoading = loadingMarkets.has(market.ticker);
                                    const displayTitle = marketData.yesSubTitle || marketData.noSubTitle || marketData.subtitle || 'Market Option';
                                    const marketImageUrl = (market as any)?.image_url || (market as any)?.imageUrl;
                                    const yesPrice = marketData.yesAsk ? Math.round(parseFloat(marketData.yesAsk) * 100) : null;
                                    const noPrice = marketData.noAsk ? Math.round(parseFloat(marketData.noAsk) * 100) : null;
                                    const chance = marketData.yesBid ? Math.round(parseFloat(marketData.yesBid) * 100) : null;

                                    return (
                                        <div
                                            key={market.ticker}
                                            onClick={() => setSelectedMarketTicker(market.ticker)}
                                            className="p-3 rounded-xl cursor-pointer transition-all duration-200 bg-[var(--surface)] hover:bg-[var(--surface-hover)] border-2 border-transparent"
                                        >
                                            {/* Mobile: Stacked layout, Desktop: Row layout */}
                                            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
                                                {/* Title + Chance Row */}
                                                <div className="flex items-center justify-between sm:flex-1 gap-2">
                                                    {/* Market Image + Title */}
                                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                                        {marketImageUrl ? (
                                                            <div className="w-7 h-7 rounded-lg overflow-hidden flex-shrink-0">
                                                                <img
                                                                    src={marketImageUrl}
                                                                    alt={displayTitle}
                                                                    className="w-full h-full object-cover"
                                                                />
                                                            </div>
                                                        ) : (
                                                            <div className="w-7 h-7 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                                                <span className="text-xs">🏈</span>
                                                            </div>
                                                        )}
                                                        <h3 className="font-medium text-sm text-[var(--text-primary)] min-w-0 truncate">
                                                            {displayTitle}
                                                        </h3>
                                                    </div>

                                                    {/* Chance */}
                                                    <span className="text-lg sm:text-xl font-bold text-[var(--text-primary)] flex-shrink-0">
                                                        {chance !== null ? `${chance}%` : '—'}
                                                    </span>
                                                </div>

                                                {/* Yes/No Buttons Row */}
                                                <div className="flex items-center gap-2 sm:flex-shrink-0">
                                                    {/* Yes Button */}
                                                    <div
                                                        className="flex-1 sm:flex-none"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedMarketTicker(market.ticker);
                                                            setSelectedSide('yes');
                                                            if (isMobileView) setMobileTradeOpen(true);
                                                        }}
                                                    >
                                                        {isLoading ? (
                                                            <div className="h-10 bg-[var(--surface-hover)] rounded-lg animate-pulse" />
                                                        ) : (
                                                            <div className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:min-w-[100px] text-center transition-all cursor-pointer ${isSelected && selectedSide === 'yes'
                                                                ? 'bg-white border-2 border-white shadow-lg shadow-white/25'
                                                                : 'bg-white/15 border border-white/30 hover:bg-white/25'
                                                                }`}>
                                                                <span className={`font-bold text-xs sm:text-sm ${isSelected && selectedSide === 'yes' ? 'text-white' : 'text-white'
                                                                    }`}>
                                                                    Yes {yesPrice !== null ? `${yesPrice}¢` : '—'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* No Button */}
                                                    <div
                                                        className="flex-1 sm:flex-none"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setSelectedMarketTicker(market.ticker);
                                                            setSelectedSide('no');
                                                            if (isMobileView) setMobileTradeOpen(true);
                                                        }}
                                                    >
                                                        {isLoading ? (
                                                            <div className="h-10 bg-[var(--surface-hover)] rounded-lg animate-pulse" />
                                                        ) : (
                                                            <div className={`px-3 py-2 sm:px-4 sm:py-2.5 rounded-lg sm:min-w-[100px] text-center transition-all cursor-pointer ${isSelected && selectedSide === 'no'
                                                                ? 'bg-pink-500 border-2 border-pink-400 shadow-lg shadow-pink-500/25'
                                                                : 'bg-pink-500/15 border border-pink-500/30 hover:bg-pink-500/25'
                                                                }`}>
                                                                <span className={`font-bold text-xs sm:text-sm ${isSelected && selectedSide === 'no' ? 'text-white' : 'text-pink-400'
                                                                    }`}>
                                                                    No {noPrice !== null ? `${noPrice}¢` : '—'}
                                                                </span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            )}

                            {/* Show More Button */}
                            {!showAllMarkets && activeMarkets.length > 4 && (
                                <button
                                    onClick={() => setShowAllMarkets(true)}
                                    className="w-full p-3 bg-[var(--surface)] hover:bg-[var(--surface-hover)] rounded-xl text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors border-2 border-dashed border-[var(--border-color)] hover:border-white/30"
                                >
                                    Show {activeMarkets.length - 4} More Markets
                                </button>
                            )}

                            {/* Show Less Button */}
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

                    {/* Right Column - Trade Card (Sticky on Desktop, Hidden on Mobile) */}
                    <div className="hidden lg:block lg:w-[35%] flex-shrink-0">
                        <div className="lg:sticky lg:top-6">
                            {selectedMarket ? (
                                <div className="bg-[var(--surface)] rounded-2xl overflow-hidden">
                                    {/* Card Header */}
                                    <div className="p-4 border-b border-[var(--border-color)]/50">
                                        <div className="flex items-center gap-2">
                                            {(() => {
                                                const selectedMarketBase = activeMarkets.find(m => m.ticker === selectedMarket.ticker);
                                                const selectedMarketImageUrl =
                                                    (selectedMarketBase as any)?.image_url ||
                                                    (selectedMarketBase as any)?.imageUrl ||
                                                    (selectedMarket as any)?.image_url ||
                                                    (selectedMarket as any)?.imageUrl;
                                                return selectedMarketImageUrl ? (
                                                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0">
                                                        <img
                                                            src={selectedMarketImageUrl}
                                                            alt={selectedMarket.yesSubTitle || selectedMarket.noSubTitle || selectedMarket.subtitle || 'Market Option'}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    </div>
                                                ) : (
                                                    <div className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                                                        <span className="text-sm">🏈</span>
                                                    </div>
                                                );
                                            })()}
                                            <h3 className="font-semibold text-[var(--text-primary)] leading-tight text-sm">
                                                {selectedMarket.yesSubTitle || selectedMarket.noSubTitle || selectedMarket.subtitle || 'Market Option'}
                                            </h3>
                                        </div>
                                        {selectedMarket.closeTime && (
                                            <p className="text-xs text-[var(--text-tertiary)] mt-1">
                                                Closes {formatDate(selectedMarket.closeTime)}
                                            </p>
                                        )}
                                    </div>

                                    {/* Trade Component */}
                                    <div className="p-4">
                                        <TradeMarket market={selectedMarket} initialSide={selectedSide} />
                                    </div>

                                    {/* Share Blink */}
                                    <div className="px-4 pb-4 border-t border-[var(--border-color)]/50 pt-4">
                                        <ShareBlink market={selectedMarket} />
                                    </div>
                                </div>
                            ) : (
                                <div className="bg-[var(--surface)] rounded-2xl p-8 text-center">
                                    <p className="text-[var(--text-tertiary)]">Select a market to trade</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </main>

            {/* Mobile Trade Modal - opens on option tap */}
            {isMobileView && mobileTradeOpen && selectedMarket && (
                <div className="fixed inset-0 z-50 bg-black/70 flex items-end">
                    <div
                        className="w-full rounded-t-2xl bg-[var(--surface)] border border-[var(--border-color)]/60 shadow-2xl p-4"
                        style={{ animation: 'drawerUp 220ms ease-out' }}
                    >
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="font-semibold text-[var(--text-primary)] text-sm truncate">
                                {selectedMarket.yesSubTitle || selectedMarket.noSubTitle || selectedMarket.subtitle || 'Market Option'}
                            </h3>
                            <button
                                onClick={() => setMobileTradeOpen(false)}
                                className="w-8 h-8 rounded-full bg-[var(--surface-hover)] text-[var(--text-primary)] flex items-center justify-center"
                                aria-label="Close"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex gap-2 mb-3">
                            <button
                                onClick={() => setSelectedSide('yes')}
                                className={`flex-1 py-2.5 px-3 rounded-xl font-medium text-sm transition-all duration-200 ${selectedSide === 'yes'
                                    ? 'bg-gradient-to-r from-white to-white text-white shadow-lg shadow-white/30 scale-[1.02]'
                                    : 'bg-white/10 text-white border border-white/20 hover:bg-white/20'
                                    }`}
                            >
                                Yes {selectedMarket.yesAsk ? `${Math.round(parseFloat(selectedMarket.yesAsk) * 100)}¢` : '—'}
                            </button>
                            <button
                                onClick={() => setSelectedSide('no')}
                                className={`flex-1 py-2.5 px-3 rounded-xl font-medium text-sm transition-all duration-200 ${selectedSide === 'no'
                                    ? 'bg-gradient-to-r from-pink-500 to-pink-400 text-white shadow-lg shadow-pink-500/30 scale-[1.02]'
                                    : 'bg-pink-500/10 text-pink-400 border border-pink-500/20 hover:bg-pink-500/20'
                                    }`}
                            >
                                No {selectedMarket.noAsk ? `${Math.round(parseFloat(selectedMarket.noAsk) * 100)}¢` : '—'}
                            </button>
                        </div>

                        <div className="bg-[var(--background)] rounded-lg border border-[var(--border-color)]/60 mb-2 px-3 py-2 flex items-center gap-2">
                            <span className="text-sm text-[var(--text-secondary)]">$</span>
                            <input
                                type="number"
                                value={mobileAmount}
                                onChange={(e) => setMobileAmount(e.target.value)}
                                placeholder="0"
                                step="1"
                                min="0"
                                disabled={mobileTradeLoading}
                                className="flex-1 bg-transparent text-[var(--text-primary)] text-base placeholder-[var(--text-tertiary)]/60 focus:outline-none disabled:opacity-50"
                            />
                        </div>

                        <div className="flex items-center justify-between mb-3   px-2 py-1.5 bg-green-500/5 rounded-xl border border-green-500/10">
                            {(() => {
                                const price = selectedSide === 'yes'
                                    ? (selectedMarket.yesAsk ? parseFloat(selectedMarket.yesAsk) : null)
                                    : (selectedMarket.noAsk ? parseFloat(selectedMarket.noAsk) : null);
                                const amount = mobileAmount ? parseFloat(mobileAmount) : 0;
                                const toWin = price && price > 0 && amount > 0 ? (amount / price).toFixed(2) : '0.00';
                                return (
                                    <>
                                        <div className="pl-2">
                                            <p className="text-[11px] text-[var(--text-tertiary)] mb-0.5">To win</p>
                                        </div>
                                        <div className="text-xl font-semibold bg-gradient-to-br from-green-400 to-emerald-500 bg-clip-text text-transparent pr-2">
                                            {amount > 0 && price ? Math.round(parseFloat(toWin)) : '0'}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>

                        <button
                            onClick={handleMobileTrade}
                            disabled={mobileTradeLoading || !mobileAmount || parseFloat(mobileAmount) <= 0}
                            className="w-full py-3 bg-gradient-to-r from-white to-gray-400 hover:from-white hover:to-gray-300 text-white rounded-xl disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed transition-all duration-200 font-medium text-base shadow-lg shadow-white/20 hover:shadow-white/30 hover:scale-[1.01] active:scale-[0.99]"
                        >
                            {mobileTradeLoading ? 'Placing Order...' : authenticated ? 'Place Order' : 'Sign In to Trade'}
                        </button>

                        {mobileTradeStatus && (
                            <p className={`mt-3 text-xs px-3 py-2 rounded-xl text-center font-medium ${mobileTradeStatus.includes('✅')
                                ? 'bg-green-500/10 text-green-400 border border-green-500/20'
                                : mobileTradeStatus.includes('❌')
                                    ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    : 'bg-white/10 text-white border border-white/20'
                                }`}>
                                {mobileTradeStatus}
                            </p>
                        )}
                    </div>
                    <style jsx>{`
                        @keyframes drawerUp {
                            from {
                                transform: translateY(100%);
                                opacity: 0;
                            }
                            to {
                                transform: translateY(0);
                                opacity: 1;
                            }
                        }
                    `}</style>
                </div>
            )}
        </div>
    );
}