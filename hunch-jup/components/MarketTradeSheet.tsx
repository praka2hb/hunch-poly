import CustomKeypad from '@/components/CustomKeypad';
import LightChart from '@/components/LightChart';
import { Toast } from '@/components/Toast';
import TradeQuoteSheet from '@/components/TradeQuoteSheet';
import { Theme } from '@/constants/theme';
import { api, getEventDetails, marketsApi } from "@/lib/api";
import { invertCandlesForNoSide } from "@/lib/marketUtils";
import { createSignedClobOrder, ClobSide, getRelayClient, buildApprovalTransactions, deriveOrCreateApiKey, deriveSafeAddress } from "@/lib/polymarketClient";
import { fetchPolygonUsdcBalance, isSafeDeployedOnChain } from "@/lib/polygon";
import { User as BackendUser, CandleData, Market } from "@/lib/types";
import { ethers } from "ethers";
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Image, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SHEET_CHART_HEIGHT = 200;
const SWIPE_THRESHOLD = 0.7;

// SwipeToTrade component
const SwipeToTrade = ({
    onSwipeComplete,
    isLoading,
    disabled,
    amount,
    isInsufficientBalance,
}: {
    onSwipeComplete: () => void;
    isLoading: boolean;
    disabled: boolean;
    amount?: string;
    isInsufficientBalance?: boolean;
}) => {
    const translateX = useRef(new Animated.Value(0)).current;
    const [trackWidth, setTrackWidth] = useState(0);
    const thumbWidth = 56;
    const lastHapticRef = useRef(0);
    const maxSwipeRef = useRef(0);
    const disabledRef = useRef(disabled);
    const isLoadingRef = useRef(isLoading);
    const onSwipeCompleteRef = useRef(onSwipeComplete);
    disabledRef.current = disabled;
    isLoadingRef.current = isLoading;
    onSwipeCompleteRef.current = onSwipeComplete;

    const maxSwipe = Math.max(0, trackWidth - thumbWidth - 8);
    maxSwipeRef.current = maxSwipe;

    const thumbPanResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onStartShouldSetPanResponderCapture: () => true,
            onMoveShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponderCapture: () => true,
            onShouldBlockNativeResponder: () => true,
            onPanResponderGrant: () => {
                if (disabledRef.current || isLoadingRef.current) return;
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            },
            onPanResponderMove: (_, gesture) => {
                if (disabledRef.current || isLoadingRef.current || maxSwipeRef.current <= 0) return;
                const newX = Math.max(0, Math.min(gesture.dx, maxSwipeRef.current));
                translateX.setValue(newX);

                const progress = newX / maxSwipeRef.current;
                const now = Date.now();
                if (now - lastHapticRef.current > 50 && progress > 0.1) {
                    Haptics.selectionAsync();
                    lastHapticRef.current = now;
                }
            },
            onPanResponderRelease: (_, gesture) => {
                if (disabledRef.current || isLoadingRef.current || maxSwipeRef.current <= 0) {
                    translateX.setValue(0);
                    return;
                }
                const progress = Math.max(0, gesture.dx) / maxSwipeRef.current;

                if (progress >= SWIPE_THRESHOLD) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    Animated.spring(translateX, {
                        toValue: maxSwipeRef.current,
                        useNativeDriver: true,
                        tension: 40,
                        friction: 7,
                    }).start(() => {
                        onSwipeCompleteRef.current();
                        setTimeout(() => {
                            Animated.spring(translateX, {
                                toValue: 0,
                                useNativeDriver: true,
                                tension: 40,
                                friction: 8,
                            }).start();
                        }, 500);
                    });
                } else {
                    Animated.spring(translateX, {
                        toValue: 0,
                        useNativeDriver: true,
                        tension: 60,
                        friction: 8,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                Animated.spring(translateX, {
                    toValue: 0,
                    useNativeDriver: true,
                    tension: 60,
                    friction: 8,
                }).start();
            },
        })
    ).current;

    const safeMax = Math.max(1, maxSwipe);
    const textOpacity = translateX.interpolate({
        inputRange: [0, safeMax * 0.3, safeMax],
        outputRange: [1, 0.3, 0],
        extrapolate: 'clamp',
    });

    return (
        <View
            className={`mt-2 h-16 rounded-2xl overflow-hidden ${disabled ? 'opacity-50' : ''}`}
            style={{ backgroundColor: '#FFE500' }}
            onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
        >
            <Animated.View
                className="absolute inset-0 justify-center items-center"
                style={{ opacity: textOpacity }}
                pointerEvents="none"
            >
                <Text className="text-black text-base font-extrabold">
                    {isLoading ? 'Placing...' : (
                        isInsufficientBalance ? 'Insufficient trading balance' :
                            (amount && Number(amount) > 0 ? `Swipe to Bet $${amount}` : 'Swipe to Place Bet')
                    )}
                </Text>
            </Animated.View>

            {!isLoading && (
                <Animated.View
                    style={[
                        {
                            position: 'absolute',
                            left: 4,
                            top: 4,
                            width: thumbWidth,
                            height: 56,
                            borderRadius: 14,
                            backgroundColor: '#000000',
                            justifyContent: 'center',
                            alignItems: 'center',
                            transform: [{ translateX }],
                        },
                    ]}
                    {...thumbPanResponder.panHandlers}
                >
                    <Ionicons name="chevron-forward" size={24} color="#FFE500" />
                </Animated.View>
            )}

            {isLoading && (
                <View className="absolute inset-0 justify-center items-center">
                    <ActivityIndicator size="small" color="#000000" />
                </View>
            )}
        </View>
    );
};

type TimeFilter = '24h' | '1w' | '1m' | 'all';

const TIME_FILTER_OPTIONS: { key: TimeFilter; label: string; seconds: number }[] = [
    { key: '24h', label: '24H', seconds: 24 * 60 * 60 },
    { key: '1w', label: '1W', seconds: 7 * 24 * 60 * 60 },
    { key: '1m', label: '1M', seconds: 30 * 24 * 60 * 60 },
    { key: 'all', label: 'All', seconds: 365 * 24 * 60 * 60 },
];

const TIME_FILTER_INTERVALS: Record<TimeFilter, 1 | 60 | 1440> = {
    '24h': 1,
    '1w': 60,
    '1m': 60,
    'all': 1440,
};

export interface MarketTradeSheetProps {
    visible: boolean;
    onClose: () => void;
    onTradeSuccess?: (tradeData: any, displayInfo: any, tradeId: string) => void;
    onRefreshFeed?: () => void;
    market: Market | null;
    candles?: CandleData[];
    backendUser: BackendUser | null;
    walletProvider: any;
    initialSide?: 'yes' | 'no';
    eventTitle?: string;
}

export const MarketTradeSheet: React.FC<MarketTradeSheetProps> = ({
    visible,
    onClose,
    onTradeSuccess,
    onRefreshFeed,
    market,
    candles: initialCandles,
    backendUser,
    walletProvider,
    initialSide = 'yes',
    eventTitle: propEventTitle,
}) => {
    const insets = useSafeAreaInsets();
    const tradeRouter = useRouter();
    const sheetHeight = Math.round(Dimensions.get("window").height * 0.92);
    const slideAnim = useRef(new Animated.Value(sheetHeight)).current;
    const scrollOffsetRef = useRef(0);
    const isDraggingSheet = useRef(false);
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => false,
            onMoveShouldSetPanResponder: (_, gesture) => {
                if (gesture.dy > 10 && Math.abs(gesture.dy) > Math.abs(gesture.dx) && scrollOffsetRef.current <= 0) {
                    isDraggingSheet.current = true;
                    return true;
                }
                return false;
            },
            onPanResponderMove: (_, gesture) => {
                if (gesture.dy > 0) {
                    slideAnim.setValue(gesture.dy);
                }
            },
            onPanResponderRelease: (_, gesture) => {
                isDraggingSheet.current = false;
                if (gesture.dy > sheetHeight * 0.2 || gesture.vy > 0.5) {
                    onClose();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 30,
                        stiffness: 500,
                    }).start();
                }
            },
            onPanResponderTerminate: () => {
                isDraggingSheet.current = false;
                Animated.spring(slideAnim, {
                    toValue: 0,
                    useNativeDriver: true,
                    damping: 30,
                    stiffness: 500,
                }).start();
            },
        })
    ).current;
    const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>(initialSide);
    const [amount, setAmount] = useState('');
    const [isTrading, setIsTrading] = useState(false);
    const [tradeError, setTradeError] = useState<string | null>(null);
    const [amountKeypadOpen, setAmountKeypadOpen] = useState(false);
    const [showQuoteSheet, setShowQuoteSheet] = useState(false);
    const [lastTradeId, setLastTradeId] = useState<string | null>(null);
    const [lastTradeInfo, setLastTradeInfo] = useState<{ side: 'yes' | 'no'; amount: string; marketTitle: string } | null>(null);
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('1w');
    const [filteredCandles, setFilteredCandles] = useState<CandleData[]>([]);
    const [isLoadingCandles, setIsLoadingCandles] = useState(false);
    const [eventTitle, setEventTitle] = useState<string | null>(propEventTitle || null);
    const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
    const [tradeStatus, setTradeStatus] = useState<string | null>(null);

    // Quote state - computed locally from market price
    const [quoteOutAmount, setQuoteOutAmount] = useState<number | null>(null);

    // Compute "to win" locally from market bid/ask price
    // Each winning share redeems for $1.00, so: shares = amount / price; toWin = shares - amount
    useEffect(() => {
        if (!visible || !market || !amount || parseFloat(amount) <= 0) {
            setQuoteOutAmount(null);
            return;
        }

        const price = selectedSide === 'yes'
            ? parseFloat(market.yesAsk || market.yesBid || '0')
            : parseFloat(market.noAsk || market.noBid || '0');

        if (price <= 0 || price >= 1) {
            setQuoteOutAmount(null);
            return;
        }

        const betAmt = parseFloat(amount);
        const shares = betAmt / price;
        // "To win" = profit = payout - cost = shares * $1 - betAmt
        const toWin = shares - betAmt;
        setQuoteOutAmount(toWin > 0 ? toWin : null);
    }, [amount, selectedSide, market, visible]);

    // Fetch event title when sheet opens
    useEffect(() => {
        if (!visible || !market?.eventTicker || propEventTitle) {
            if (propEventTitle) setEventTitle(propEventTitle);
            return;
        }
        const fetchEventTitle = async () => {
            const event = await getEventDetails(market!.eventTicker!);
            if (event?.title) setEventTitle(event.title);
        };
        fetchEventTitle();
    }, [visible, market?.eventTicker, propEventTitle]);

    // Fetch USDC Balance on the Safe wallet (where Polymarket funds live)
    useEffect(() => {
        if (!visible || !backendUser?.walletAddress) return;
        const fetchBalance = async () => {
            try {
                const balanceAddr = backendUser.safeAddress || backendUser.walletAddress;
                const balance = await fetchPolygonUsdcBalance(balanceAddr);
                setUsdcBalance(balance);
            } catch (e) {
                console.error("Failed to load USDC balance", e);
            }
        };
        fetchBalance();
    }, [visible, backendUser]);

    const finalizeTrade = async (quote?: string) => {
        if (!lastTradeId) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            if (onRefreshFeed) onRefreshFeed();
            onClose();
            return;
        }

        if (!quote) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            if (onRefreshFeed) onRefreshFeed();
            onClose();
            return;
        }

        try {
            await api.updateTradeQuote(lastTradeId, quote);
        } catch (error) {
            console.error('Failed to update quote:', error);
        } finally {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            if (onRefreshFeed) onRefreshFeed();
            onClose();
        }
    };

    // Fetch candles based on time filter
    useEffect(() => {
        if (!visible || !market) return;

        const fetchFilteredCandles = async () => {
            setIsLoadingCandles(true);
            try {
                const selectedFilter = TIME_FILTER_OPTIONS.find((opt) => opt.key === timeFilter);
                const endTs = Math.floor(Date.now() / 1000);
                const startTs =
                    timeFilter === 'all'
                        ? Math.max(0, endTs - 365 * 24 * 60 * 60)
                        : Math.max(0, endTs - (selectedFilter?.seconds || 7 * 24 * 60 * 60));
                const interval = TIME_FILTER_INTERVALS[timeFilter]; // 1=1m, 60=1h, 1440=1d

                // Use Polymarket candlestick endpoint (conditionId = market.ticker)
                const candles = await marketsApi.fetchPolymarketCandles({
                    conditionId: market.ticker,
                    startTs,
                    endTs,
                    interval,
                });
                setFilteredCandles(candles);
            } catch (error) {
                console.error('Failed to fetch filtered candles:', error);
                setFilteredCandles(initialCandles || []);
            } finally {
                setIsLoadingCandles(false);
            }
        };

        fetchFilteredCandles();
    }, [visible, market, timeFilter, initialCandles]);

    useEffect(() => {
        if (visible) {
            setSelectedSide(initialSide);
            setAmount('');
            setTradeError(null);
            setTimeFilter('1w');
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 30,
                stiffness: 500,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: sheetHeight,
                duration: 160,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, initialSide, sheetHeight, slideAnim]);

    const handleTrade = async () => {
        if (!market || !backendUser) {
            setTradeError("Sign in to trade");
            return;
        }
        if (!walletProvider) {
            setTradeError("Wallet not connected");
            return;
        }
        if (!amount || Number(amount) <= 0) {
            setTradeError("Enter a valid amount");
            return;
        }

        if (!market.ticker) {
            setTradeError("Market id not available");
            return;
        }

        // Get the correct token ID for the selected side
        const tokenId = selectedSide === 'yes' ? market.yesMint : market.noMint;
        if (!tokenId) {
            setTradeError("Token ID not available for this market");
            return;
        }

        // Get the price (use ask for buying)
        const price = selectedSide === 'yes'
            ? parseFloat(market.yesAsk || market.yesBid || '0')
            : parseFloat(market.noAsk || market.noBid || '0');

        if (price <= 0 || price >= 1) {
            setTradeError("Invalid market price");
            return;
        }

        try {
            setIsTrading(true);
            setTradeError(null);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

            // 1. Get ethers signer from Privy embedded wallet
            setTradeStatus('Connecting wallet...');
            await walletProvider.request({
                method: "wallet_switchEthereumChain",
                params: [{ chainId: "0x89" }], // Polygon (137)
            });
            const ethersProvider = new ethers.providers.Web3Provider(walletProvider);
            const signer = ethersProvider.getSigner();

            // ─── Inline Polymarket Onboarding (first-time trade) ───────────
            const onboardingStep = backendUser.polymarketOnboardingStep || 0;

            // Always derive Safe address client-side using the SDK for consistency
            let safeAddr = backendUser.safeAddress;
            if (!safeAddr) {
                const eoaAddr = await signer.getAddress();
                safeAddr = await deriveSafeAddress(eoaAddr);
            }

            if (onboardingStep < 4) {
                console.log('[MarketTradeSheet] Onboarding incomplete (step', onboardingStep, '), running inline setup...');

                // Step 1: Derive Safe address (tell backend)
                if (onboardingStep < 1) {
                    setTradeStatus('Setting up trading wallet...');
                    const deriveResult = await api.deriveSafe();
                    safeAddr = deriveResult.safeAddress;
                    console.log('[MarketTradeSheet] Step 1 done — Safe derived:', safeAddr);
                }

                if (!safeAddr) {
                    throw new Error('Failed to derive Safe address');
                }

                // Step 2: Deploy Safe (gasless via relay), poll until mined
                if (onboardingStep < 2) {
                    setTradeStatus('Deploying trading wallet...');

                    const alreadyDeployed = await isSafeDeployedOnChain(safeAddr);
                    if (alreadyDeployed) {
                        console.log('[MarketTradeSheet] Safe already deployed on-chain, skipping relay deploy');
                        await api.confirmSafeDeployed('already-deployed');
                    } else {
                        const relayClient = await getRelayClient(signer, safeAddr);
                        const deployResponse = await relayClient.deploy();

                        // Poll until the deploy tx is mined (matching reference implementation)
                        const { RelayerTransactionState } = await import('@polymarket/builder-relayer-client');
                        const deployResult = await relayClient.pollUntilState(
                            deployResponse.transactionID,
                            [
                                RelayerTransactionState.STATE_MINED,
                                RelayerTransactionState.STATE_CONFIRMED,
                                RelayerTransactionState.STATE_FAILED,
                            ],
                            '60',
                            3000,
                        );

                        if (!deployResult || deployResult.state === RelayerTransactionState.STATE_FAILED) {
                            throw new Error('Safe deployment failed');
                        }

                        const txHash = deployResult.transactionHash || deployResult.proxyAddress || '';
                        await api.confirmSafeDeployed(txHash);
                        console.log('[MarketTradeSheet] Step 2 done — Safe deployed:', txHash);
                    }
                }

                // Step 3: Set token approvals (gasless via relay), wait for mining
                if (onboardingStep < 3) {
                    setTradeStatus('Approving tokens...');
                    const relayClient = await getRelayClient(signer, safeAddr);
                    const approvalTxs = buildApprovalTransactions();
                    const executeResult = await relayClient.execute(approvalTxs);
                    await executeResult.wait();
                    await api.confirmApprovalsSet('approvals-confirmed');
                    console.log('[MarketTradeSheet] Step 3 done — Approvals mined');
                }

                // Step 4: Derive CLOB API credentials (uses EOA signatureType)
                if (onboardingStep < 4) {
                    setTradeStatus('Creating API credentials...');
                    const creds = await deriveOrCreateApiKey(signer);
                    await api.savePolymarketCredentials(creds);
                    console.log('[MarketTradeSheet] Step 4 done — Credentials saved');
                }

                console.log('[MarketTradeSheet] Inline onboarding complete, placing order...');
            }
            // ─── End Onboarding ────────────────────────────────────────────

            // 2. Calculate size (number of shares) = USDC amount / price per share
            setTradeStatus('Executing order...');
            const betAmt = parseFloat(amount);
            const size = Math.floor((betAmt / price) * 100) / 100; // Round down to 2 decimals

            // 3. Create EIP-712 signed CLOB order using Privy wallet
            //    The Safe address is used as the maker in the EIP-712 signature.
            //    Dummy creds are passed because our backend handles HMAC auth.
            const signedOrder = await createSignedClobOrder({
                signer,
                creds: { key: '', secret: '', passphrase: '' },
                safeAddress: safeAddr,
                tokenId,
                side: ClobSide.BUY,
                price,
                size,
                feeRateBps: 0,
                tickSize: '0.01',
                negRisk: true,
            });

            // 4. Submit signed order to our backend (which relays to CLOB with HMAC auth)
            const result = await api.submitPolymarketOrder({
                order: signedOrder,
                conditionId: market.ticker,
                tokenId,
                side: 'BUY',
                marketTitle: market?.title || market.ticker,
            });

            const estimatedSpendUsdc = betAmt.toFixed(2);
            const entryPrice = price.toFixed(4);

            const displayInfo = {
                side: selectedSide,
                amount: estimatedSpendUsdc,
                marketTitle: market?.title || market.ticker,
            };

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            setLastTradeId(result.tradeId);
            setLastTradeInfo(displayInfo);
            setShowQuoteSheet(true);

            if (onTradeSuccess) {
                onTradeSuccess({
                    userId: backendUser.id,
                    marketTicker: market.ticker,
                    eventTicker: market.eventTicker,
                    side: selectedSide,
                    action: 'BUY' as const,
                    amount: estimatedSpendUsdc,
                    walletAddress: backendUser.walletAddress,
                    entryPrice,
                }, displayInfo, result.tradeId);
            }
        } catch (error: any) {
            console.error('Trade error:', error);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            setTradeError(error?.message || "Failed to place trade");
        } finally {
            setIsTrading(false);
            setTradeStatus(null);
        }
    };

    const betAmount = parseFloat(amount || '0');

    const displayCandles = filteredCandles.length > 0 ? filteredCandles : (initialCandles || []);
    const chartCandles = useMemo(
        () => (selectedSide === 'no' ? invertCandlesForNoSide(displayCandles) : displayCandles),
        [displayCandles, selectedSide]
    );
    const chartContainerRef = useRef<View>(null);
    const chartLayoutRef = useRef({ x: 0, width: 1 });
    const scrubStateRef = useRef({ lastIndex: -1, lastHaptic: 0 });
    const [scrubPrice, setScrubPrice] = useState<number | null>(null);
    const [scrubIndex, setScrubIndex] = useState<number | null>(null);
    const [scrubTimestamp, setScrubTimestamp] = useState<number | null>(null);
    const [isScrubbing, setIsScrubbing] = useState(false);

    const updateChartLayout = () => {
        chartContainerRef.current?.measureInWindow((x, _y, width) => {
            chartLayoutRef.current = { x, width: Math.max(width, 1) };
        });
    };

    const triggerScrubHaptic = (moveX: number) => {
        const { x, width } = chartLayoutRef.current;
        const length = chartCandles.length;
        if (!length || width <= 0) return;
        const localX = Math.min(Math.max(moveX - x, 0), width);
        const index = Math.floor((localX / width) * length);
        if (index !== scrubStateRef.current.lastIndex) {
            const nextPrice = chartCandles[index]?.close;
            if (typeof nextPrice === 'number') {
                setScrubPrice(nextPrice);
            }
            setScrubIndex(index);
            const nextTs = chartCandles[index]?.timestamp;
            setScrubTimestamp(typeof nextTs === 'number' ? nextTs : null);
            const now = Date.now();
            if (now - scrubStateRef.current.lastHaptic > 20) {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                scrubStateRef.current.lastHaptic = now;
            }
            scrubStateRef.current.lastIndex = index;
        }
    };

    const handleScrubStart = useCallback((moveX: number) => {
        setIsScrubbing(true);
        triggerScrubHaptic(moveX);
    }, []);

    const handleScrubEnd = useCallback(() => {
        setIsScrubbing(false);
        setScrubPrice(null);
        setScrubIndex(null);
        setScrubTimestamp(null);
        scrubStateRef.current.lastIndex = -1;
    }, []);

    const formatScrubTime = (timestamp?: number | null) => {
        if (!timestamp) return '—';
        const date = new Date(timestamp * 1000);
        if (timeFilter === '24h') {
            return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        }
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable className="flex-1 justify-end" onPress={onClose}>
                <BlurView intensity={20} tint="default" style={StyleSheet.absoluteFill} />
                <View style={styles.backdropTint} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
                    style={{ width: "100%" }}
                >
                    <Animated.View
                        {...panResponder.panHandlers}
                        style={[
                            styles.sheet,
                            {
                                paddingBottom: Math.max(insets.bottom, 20),
                                height: sheetHeight,
                                transform: [{ translateY: slideAnim }],
                                borderTopColor: market?.colorCode ? market.colorCode + '66' : Theme.border,
                                borderLeftColor: market?.colorCode ? market.colorCode + '22' : Theme.border,
                                borderRightColor: market?.colorCode ? market.colorCode + '22' : Theme.border,
                            },
                        ]}
                    >
                        <Pressable onPress={(e) => e.stopPropagation()}>
                            <View>
                                {/* drag handle */}
                                <View className="items-center py-2">
                                    <View
                                        className="w-12 h-1.5 rounded-full"
                                        style={{ backgroundColor: market?.colorCode ? market.colorCode + 'bb' : Theme.border }}
                                    />
                                </View>

                                {/* ── Header: market avatar + titles + price ────── */}
                                <View className="mb-4">
                                    <View className="flex-row items-center gap-3">
                                        {/* Market image as avatar / profile picture */}
                                        {market?.image_url ? (
                                            <View style={styles.marketAvatar}>
                                                <Image
                                                    source={{ uri: market.image_url }}
                                                    style={{ width: '100%', height: '100%' }}
                                                    resizeMode="cover"
                                                />
                                                {market?.colorCode && (
                                                    <View style={[StyleSheet.absoluteFill, { borderRadius: 14, borderWidth: 2, borderColor: market.colorCode + 'aa' }]} />
                                                )}
                                            </View>
                                        ) : null}

                                        {/* Title + price block */}
                                        <View className="flex-1">
                                            <Text className="text-sm font-semibold text-txt-secondary mb-1" numberOfLines={1}>
                                                {eventTitle || market?.subtitle || ''}
                                            </Text>
                                            <Text className="text-base font-bold text-txt-primary mb-1" numberOfLines={2}>
                                                {selectedSide === 'yes'
                                                    ? (market?.yesSubTitle || market?.title || 'Yes')
                                                    : (market?.noSubTitle || market?.title || 'No')}
                                            </Text>
                                            <Text
                                                className="text-2xl font-bold"
                                                style={{ color: selectedSide === 'yes' ? '#32de12' : Theme.chartNegative }}
                                            >
                                                {(() => {
                                                    const price = scrubPrice ?? chartCandles[chartCandles.length - 1]?.close;
                                                    if (typeof price !== 'number') return '—';
                                                    return `${(price * 100).toFixed(1)}%`;
                                                })()}
                                            </Text>
                                        </View>
                                    </View>
                                </View>

                            <ScrollView
                                showsVerticalScrollIndicator={false}
                                contentContainerStyle={{ paddingBottom: 16 }}
                                scrollEnabled={!isScrubbing && !isDraggingSheet.current}
                                onScroll={(e) => { scrollOffsetRef.current = e.nativeEvent.contentOffset.y; }}
                                scrollEventThrottle={16}
                                bounces={false}
                            >
                                <View
                                    ref={chartContainerRef}
                                    onLayout={updateChartLayout}
                                    className="h-[240px] rounded-2xl overflow-hidden mb-3"
                                    onStartShouldSetResponder={() => true}
                                    onStartShouldSetResponderCapture={() => true}
                                    onMoveShouldSetResponder={() => true}
                                    onMoveShouldSetResponderCapture={() => true}
                                    onResponderGrant={(e) => handleScrubStart(e.nativeEvent.pageX)}
                                    onResponderMove={(e) => triggerScrubHaptic(e.nativeEvent.pageX)}
                                    onResponderRelease={handleScrubEnd}
                                    onResponderTerminate={handleScrubEnd}
                                >
                                    {scrubTimestamp && (
                                        <View className="absolute top-2 left-0 right-0 items-center z-10" pointerEvents="none">
                                            <Text className="text-xs text-txt-secondary">{formatScrubTime(scrubTimestamp)}</Text>
                                        </View>
                                    )}
                                    {chartCandles.length > 0 ? (
                                        <View className="flex-1">
                                            <LightChart
                                                candles={chartCandles}
                                                width={SCREEN_WIDTH - 40}
                                                height={SHEET_CHART_HEIGHT}
                                                colorByTrend={true}
                                                scrubIndex={scrubIndex}
                                                showFill={true}
                                                showGlow={false}
                                                strokeWidth={3}
                                            />
                                            {isLoadingCandles && (
                                                <View className="absolute top-2 right-2 p-1.5 rounded-full bg-white/10 backdrop-blur-sm">
                                                    <ActivityIndicator size="small" color={Theme.accentSubtle} />
                                                </View>
                                            )}
                                        </View>
                                    ) : isLoadingCandles ? (
                                        <View className="flex-1 justify-center items-center gap-2">
                                            <ActivityIndicator size="small" color={Theme.accentSubtle} />
                                            <Text className="text-xs text-txt-disabled">Loading chart...</Text>
                                        </View>
                                    ) : (
                                        <View className="flex-1 justify-center items-center gap-2">
                                            <ActivityIndicator size="small" color={Theme.textDisabled} />
                                            <Text className="text-xs text-txt-disabled">No data available</Text>
                                        </View>
                                    )}
                                </View>

                                <View className="flex-row items-center justify-center gap-2 mb-2">
                                    {TIME_FILTER_OPTIONS.map((option) => (
                                        <TouchableOpacity
                                            key={option.key}
                                            className="px-3 py-1.5 rounded-full"
                                            onPress={() => { setTimeFilter(option.key); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); }}
                                            activeOpacity={0.6}
                                        >
                                            <Text className={`text-xs font-semibold ${timeFilter === option.key ? '' : 'text-txt-disabled'}`} style={timeFilter === option.key ? { color: Theme.accentSubtle } : {}}>
                                                {option.label}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Yes/No Toggle */}
                                <View className="flex-row gap-3 mb-4 px-4">
                                    <TouchableOpacity
                                        className={`flex-1 py-3.5 rounded-2xl border-[1.5px] ${selectedSide === 'yes' ? 'border-[#10ff1f]' : 'bg-gray-50 border-gray-200'}`}
                                        style={selectedSide === 'yes' ? { backgroundColor: '#34f011' } : undefined}
                                        onPress={() => { setSelectedSide('yes'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text className="text-center font-bold text-2xl" style={{ color: selectedSide === 'yes' ? '#FFFFFF' : Theme.textDisabled }}>YES</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        className={`flex-1 py-3.5 rounded-2xl border-[1.5px] ${selectedSide === 'no' ? 'border-[#FF10F0]' : 'bg-gray-50 border-gray-200'}`}
                                        style={selectedSide === 'no' ? { backgroundColor: '#FF10F0' } : undefined}
                                        onPress={() => { setSelectedSide('no'); Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }}
                                        activeOpacity={0.7}
                                    >
                                        <Text className="text-center font-bold text-2xl" style={{ color: selectedSide === 'no' ? '#FFFFFF' : Theme.textDisabled }}>NO</Text>
                                    </TouchableOpacity>
                                </View>

                                <View className="px-4">
                                    <Text className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-2">Amount</Text>
                                    <View className={`flex-row items-center rounded-2xl px-4 py-1 ${!amount || amount === '0' || amount === '0.00' ? 'bg-[#F3F4F6]' : 'bg-transparent'}`}>
                                        <Text className="text-txt-secondary text-2xl font-semibold">$</Text>
                                        <Pressable className="flex-1" onPress={() => setAmountKeypadOpen(true)}>
                                            <Text className={`${!amount || amount === '0' || amount === '0.00' ? 'text-gray-300' : 'text-txt-primary'} text-[24px] font-bold py-2 pl-1.5`}>
                                                {amount || "0.00"}
                                            </Text>
                                        </Pressable>
                                        {betAmount > 0 && !tradeError && (
                                            <View className="items-end">
                                                <Text className="text-txt-secondary text-[10px] uppercase">To Win</Text>
                                                <Text className="text-[#52e717] text-2xl font-extrabold">
                                                    ${quoteOutAmount ? quoteOutAmount.toFixed(2) : '—'}
                                                </Text>
                                            </View>
                                        )}
                                    </View>
                                    {tradeError && (
                                        <Text className="text-[#FF10F0] text-xs font-medium mt-1 ml-1">{tradeError}</Text>
                                    )}
                                </View>
                                <View className="px-4 mt-6">
                                    <SwipeToTrade
                                        onSwipeComplete={handleTrade}
                                        isLoading={isTrading}
                                        disabled={isTrading || !amount || Number(amount) <= 0 || !!tradeError || (usdcBalance !== null && parseFloat(amount) > usdcBalance)}
                                        amount={amount}
                                        isInsufficientBalance={usdcBalance !== null && !!amount && parseFloat(amount) > usdcBalance}
                                    />
                                </View>
                            </ScrollView>
                            </View>
                        </Pressable>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Pressable>
            <CustomKeypad
                visible={amountKeypadOpen}
                value={amount}
                onChange={(next) => { setAmount(next.replace(',', '.')); setTradeError(null); }}
                onClose={() => setAmountKeypadOpen(false)}
            />
            <Toast visible={isTrading} message={tradeStatus || 'Order processing...'} />
            <TradeQuoteSheet
                visible={showQuoteSheet && !!lastTradeInfo}
                onClose={() => {
                    setShowQuoteSheet(false);
                    setLastTradeId(null);
                    if (onRefreshFeed) onRefreshFeed();
                    onClose();
                }}
                onSubmit={async (quoteText) => {
                    await finalizeTrade(quoteText);
                }}
                onSkip={() => {
                    setShowQuoteSheet(false);
                    setLastTradeId(null);
                    if (onRefreshFeed) onRefreshFeed();
                    onClose();
                }}
                tradeInfo={lastTradeInfo || { side: 'yes', amount: '0', marketTitle: 'Market' }}
            />
        </Modal>
    );
};

const styles = StyleSheet.create({
    sheet: {
        backgroundColor: Theme.bgMain,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        overflow: "hidden",
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: Theme.border,
    },
    marketAvatar: {
        width: 72,
        height: 72,
        borderRadius: 16,
        overflow: 'hidden',
        backgroundColor: Theme.bgCard,
        borderWidth: 2,
        borderColor: Theme.border,
        flexShrink: 0,
    },
    backdropTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.25)",
    },
});

export default MarketTradeSheet;
