import CreditCard from "@/components/CreditCard";
import { MarketTradeSheet } from "@/components/MarketTradeSheet";
import PositionActionSheet from "@/components/PositionActionSheet";
import PositionCard from "@/components/PositionCard";
import SellPositionSheet from "@/components/SellPositionSheet";
import SettingsSheet from "@/components/SettingsSheet";
import { PositionsSkeleton, ProfileSkeleton } from "@/components/skeletons";
import TradeQuoteSheet from "@/components/TradeQuoteSheet";
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { useCopyTrading } from "@/hooks/useCopyTrading";
import { api, getEventDetails, marketsApi } from "@/lib/api";
import { executeTrade, toRawAmount } from "@/lib/tradeService";
import { AggregatedPosition, Market, Trade, User } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedSolanaWallet, usePrivy } from "@privy-io/expo";
import { useFundSolanaWallet } from "@privy-io/expo/ui";
import { clusterApiUrl, Connection, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, Dimensions, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const defaultProfileImage = require("@/assets/default.jpeg");

type TradeTab = 'positions' | 'copying';
type PositionFilter = 'active' | 'previous';
type SortDirection = 'profits' | 'losses';

const formatCurrency = (value: number | null | undefined, fractionDigits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `$${value.toFixed(fractionDigits)}`;
};

const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
};



export default function ProfileScreen() {
    const { user, logout } = usePrivy();
    const { backendUser, setBackendUser } = useUser();
    const { wallets } = useEmbeddedSolanaWallet();
    const solanaWallet = wallets?.[0];
    const router = useRouter();
    const { fundWallet } = useFundSolanaWallet();
    const [profileData, setProfileData] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [trades, setTrades] = useState<Trade[]>([]);
    const [activeTab, setActiveTab] = useState<TradeTab>('positions');
    const [positionFilter, setPositionFilter] = useState<PositionFilter>('active');
    const [sortDirection, setSortDirection] = useState<SortDirection | null>(null);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [solBalance, setSolBalance] = useState<number | null>(null);
    const [solUsdPrice, setSolUsdPrice] = useState<number | null>(null);
    const [usdcBalance, setUsdcBalance] = useState<number | null>(null);
    const [positions, setPositions] = useState<{ active: AggregatedPosition[]; previous: AggregatedPosition[] }>({
        active: [],
        previous: [],
    });
    const [isLoadingPositions, setIsLoadingPositions] = useState(true);
    const [eventTitleByTicker, setEventTitleByTicker] = useState<Record<string, string>>({});

    // Sell position state
    const [sellSheetVisible, setSellSheetVisible] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<AggregatedPosition | null>(null);
    const [isSelling, setIsSelling] = useState(false);

    // Position Action Sheet state
    const [actionSheetVisible, setActionSheetVisible] = useState(false);
    const [selectedActionPosition, setSelectedActionPosition] = useState<AggregatedPosition | null>(null);

    // Quote sheet state
    const [showQuoteSheet, setShowQuoteSheet] = useState(false);
    const [lastTradeInfo, setLastTradeInfo] = useState<{ side: 'yes' | 'no'; amount: string; marketTitle: string } | null>(null);
    const [lastTradeId, setLastTradeId] = useState<string | null>(null);

    // Wallet provider state
    const [walletProvider, setWalletProvider] = useState<any>(null);

    // Get wallet provider
    useEffect(() => {
        const getProvider = async () => {
            if (solanaWallet) {
                try {
                    const provider = await solanaWallet.getProvider();
                    setWalletProvider(provider);
                } catch (e) {
                    console.error('Failed to get wallet provider:', e);
                }
            }
        };
        getProvider();
    }, [solanaWallet]);

    // Copy trading data
    const { copySettings, fetchAllCopySettings, disableCopyTrading, isLoading: copySettingsLoading } = useCopyTrading();

    // Market Sheet state
    const [marketSheetVisible, setMarketSheetVisible] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
    const [selectedMarketEventTitle, setSelectedMarketEventTitle] = useState<string | undefined>(undefined);

    const handleOpenMarketSheet = async (position: AggregatedPosition) => {
        let market = position.market;
        if (!market) {
            try {
                market = await marketsApi.fetchMarketDetails(position.marketTicker);
            } catch (e) {
                console.error("Failed to fetch market details:", e);
                return;
            }
        }

        setSelectedMarket(market);
        // Try to set event title
        if (position.eventTicker) {
            // We can optimistically try to fetch event title if not already known, 
            // but for now let's leave it undefined to avoid delay or extra fetch if not critical. 
            // MarketTradeSheet handles undefined eventTitle gracefully.
            getEventDetails(position.eventTicker).then(e => {
                if (e) setSelectedMarketEventTitle(e.title);
            }).catch(() => { });
        } else {
            setSelectedMarketEventTitle(undefined);
        }

        setMarketSheetVisible(true);
    };

    const handleCloseMarketSheet = () => {
        setMarketSheetVisible(false);
        setSelectedMarket(null);
    };

    const finalizeTrade = async (quote?: string) => {
        if (!lastTradeId) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadPositions();
            loadUsdcBalance();
            return;
        }

        if (!quote) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadPositions();
            loadUsdcBalance();
            return;
        }

        try {
            // Update the existing trade with the quote
            await api.updateTradeQuote(lastTradeId, quote);
        } catch (error) {
            console.error('Failed to update quote:', error);
        } finally {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadPositions();
            loadUsdcBalance();
        }
    };

    const slideAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(0.6)).current;
    const indicatorAnim = useRef(new Animated.Value(0)).current;

    // Solana connection for trading
    const connection = useMemo(() => {
        const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
        return new Connection(rpcUrl, 'confirmed');
    }, []);


    const paneWidth = SCREEN_WIDTH - 40;
    const tabWidth = (SCREEN_WIDTH - 40) / 2;
    const animateToTab = useCallback((tab: TradeTab) => {
        const toValue = tab === 'positions' ? 0 : -paneWidth;
        const indicatorValue = tab === 'positions' ? 0 : 1;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.parallel([
            Animated.spring(slideAnim, {
                toValue,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
            Animated.spring(indicatorAnim, {
                toValue: indicatorValue * tabWidth,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
        ]).start();
        setActiveTab(tab);
    }, [slideAnim, indicatorAnim, paneWidth, tabWidth]);

    useEffect(() => {
        if (!backendUser) return;
        let cancelled = false;
        const run = async () => {
            setIsLoading(true);
            setIsLoadingPositions(true);
            try {
                await Promise.all([
                    (async () => {
                        const data = await api.getUser(backendUser.id);
                        if (!cancelled) setProfileData(data);
                    })(),
                    (async () => {
                        const data = await api.getUserTrades(backendUser.id, 50);
                        if (!cancelled) setTrades(data);
                    })(),
                    (async () => {
                        const data = await api.getPositions(backendUser.id);
                        if (!cancelled) setPositions(data.positions);
                    })(),
                ]);
            } catch (error) {
                console.error("Failed to load profile data:", error);
            } finally {
                if (!cancelled) {
                    setIsLoading(false);
                    setIsLoadingPositions(false);
                }
                // Defer non-critical: balances and copy settings (don't block initial paint)
                if (!cancelled) {
                    loadSolBalance();
                    loadUsdcBalance();
                    fetchAllCopySettings();
                }
            }
        };
        run();
        return () => { cancelled = true; };
    }, [backendUser?.id]);

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 0.6, duration: 700, useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [pulseAnim]);

    const loadProfile = async () => {
        if (!backendUser) {
            setIsLoading(false);
            return;
        }
        try {
            const data = await api.getUser(backendUser.id);
            setProfileData(data);
        } catch (error) {
            console.error("Failed to load profile:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const loadTrades = async () => {
        if (!backendUser) return;
        try {
            const data = await api.getUserTrades(backendUser.id, 50);
            setTrades(data);
        } catch (error) {
            console.error("Failed to load trades:", error);
        }
    };

    const loadPositions = async () => {
        if (!backendUser) {
            setIsLoadingPositions(false);
            return;
        }
        try {
            setIsLoadingPositions(true);
            const data = await api.getPositions(backendUser.id);
            setPositions(data.positions);
        } catch (error) {
            console.error("Failed to load positions:", error);
        } finally {
            setIsLoadingPositions(false);
        }
    };

    const walletAddress = profileData?.walletAddress || backendUser?.walletAddress;

    const loadSolBalance = useCallback(async () => {
        if (!walletAddress) {
            setSolBalance(null);
            setSolUsdPrice(null);
            return;
        }
        try {
            const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
            const connection = new Connection(rpcUrl, 'confirmed');
            const [lamports, priceResponse] = await Promise.all([
                connection.getBalance(new PublicKey(walletAddress)),
                fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd'),
            ]);
            const priceJson = await priceResponse.json();
            setSolBalance(lamports / LAMPORTS_PER_SOL);
            setSolUsdPrice(Number(priceJson?.solana?.usd) || null);
        } catch (error) {
            console.error("Failed to load SOL balance:", error);
            setSolBalance(null);
            setSolUsdPrice(null);
        }
    }, [walletAddress]);

    const loadUsdcBalance = useCallback(async () => {
        if (!walletAddress) {
            setUsdcBalance(null);
            return;
        }
        try {
            const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
            const connection = new Connection(rpcUrl, 'confirmed');
            const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
            const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
                new PublicKey(walletAddress),
                { mint: usdcMint }
            );
            const totalBalance = tokenAccounts.value.reduce((sum, accountInfo) => {
                const amount = accountInfo.account.data?.parsed?.info?.tokenAmount?.uiAmount;
                return sum + (typeof amount === 'number' ? amount : 0);
            }, 0);
            setUsdcBalance(totalBalance);
        } catch (error) {
            console.error("Failed to load USDC balance:", error);
            setUsdcBalance(null);
        }
    }, [walletAddress]);

    const activePositions = positions.active;
    const previousPositions = positions.previous;

    useEffect(() => {
        const tickers = [...new Set([...activePositions, ...previousPositions].map((p) => p.eventTicker).filter(Boolean))] as string[];
        if (tickers.length === 0) return;
        let cancelled = false;
        Promise.all(tickers.map((t) => getEventDetails(t)))
            .then((events) => {
                if (cancelled) return;
                const next: Record<string, string> = {};
                tickers.forEach((t, i) => { if (events[i]?.title) next[t] = events[i].title; });
                setEventTitleByTicker((prev) => ({ ...prev, ...next }));
            })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [activePositions, previousPositions]);

    const getPnlValue = useCallback((p: AggregatedPosition): number => {
        const pnl =
            (p as any).totalPnL ??
            (p as any).profitLoss ??
            (p as any).unrealizedPnL ??
            (p as any).realizedPnL ??
            0;
        return typeof pnl === 'number' && Number.isFinite(pnl) ? pnl : 0;
    }, []);

    const displayedPositions = useMemo(() => {
        if (positionFilter === 'previous') return previousPositions;
        if (sortDirection === 'profits') {
            return [...activePositions].sort((a, b) => getPnlValue(b) - getPnlValue(a));
        }
        if (sortDirection === 'losses') {
            return [...activePositions].sort((a, b) => getPnlValue(a) - getPnlValue(b));
        }
        return activePositions;
    }, [positionFilter, sortDirection, activePositions, previousPositions, getPnlValue]);

    const displayedCount =
        positionFilter === 'previous' ? previousPositions.length : activePositions.length;

    const togglePositionFilter = useCallback(() => {
        setPositionFilter((prev) => (prev === 'active' ? 'previous' : 'active'));
        setSortDirection(null);
        Haptics.selectionAsync();
    }, []);

    const handleLogout = async () => {
        try {
            await api.removePushToken();
        } catch (e) {
            console.warn('[Logout] Failed to remove push token:', e);
        }
        await logout();
        setBackendUser(null);
        router.replace("/login");
    };

    // Handle opening sell sheet
    const handleOpenSell = (position: AggregatedPosition) => {
        setSelectedPosition(position);
        setSellSheetVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const handleOpenActionSheet = (position: AggregatedPosition) => {
        setSelectedActionPosition(position);
        setActionSheetVisible(true);
        Haptics.selectionAsync();
    };

    // Handle sell trade execution - sells all tokens for this position
    const handleSell = async () => {
        if (!selectedPosition || !backendUser || !solanaWallet) {
            throw new Error('Missing required data for sell');
        }

        setIsSelling(true);
        try {
            if (!selectedPosition.marketTicker) {
                throw new Error('No market id found for this position');
            }

            // Use totalTokenAmount first (this is the actual available tokens), fallback to calculation
            const tokensToSell = selectedPosition.totalTokenAmount > 0
                ? selectedPosition.totalTokenAmount
                : selectedPosition.totalTokensBought - selectedPosition.totalTokensSold;

            if (tokensToSell <= 0) {
                throw new Error('No tokens to sell');
            }

            console.log(`[Sell] Selling ${tokensToSell} contracts for market ${selectedPosition.marketTicker}`, {
                totalTokenAmount: selectedPosition.totalTokenAmount,
                totalTokensBought: selectedPosition.totalTokensBought,
                totalTokensSold: selectedPosition.totalTokensSold,
            });

            // Convert token amount to raw (6 decimals)
            const rawAmount = toRawAmount(tokensToSell, 6);

            // Get wallet provider
            const provider = await solanaWallet.getProvider();

            // Execute the sell trade
            const { signature, order } = await executeTrade({
                provider,
                connection,
                userPublicKey: backendUser.walletAddress,
                amount: rawAmount,
                marketId: selectedPosition.marketTicker,
                isYes: selectedPosition.side === 'yes',
                isBuy: false,
                positionPubkey: (selectedPosition as any).positionPubkey,
                slippageBps: 50,
            });

            // Calculate USDC received for display
            const usdcReceived = (parseInt(order.outAmount) / 1_000_000).toFixed(2);

            // Prepare trade data for immediate save
            const tradeData = {
                userId: backendUser.id,
                marketTicker: selectedPosition.marketTicker,
                eventTicker: selectedPosition.eventTicker || undefined,
                side: selectedPosition.side,
                action: 'SELL' as const,
                amount: usdcReceived,
                walletAddress: backendUser.walletAddress,
                transactionSig: signature,
                executedInAmount: order.inAmount,
                executedOutAmount: order.outAmount,

            };

            // Save trade to backend immediately to get the trade ID
            const savedTrade = await api.createTrade(tradeData);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSellSheetVisible(false);

            // Show quote sheet with the saved trade ID
            setLastTradeId(savedTrade.id);
            setLastTradeInfo({
                side: selectedPosition.side,
                amount: usdcReceived,
                marketTitle: selectedPosition.market?.title || selectedPosition.marketTicker,
            });
            setShowQuoteSheet(true);

            setSelectedPosition(null);

            // Reload positions and balances
            loadPositions();
            loadUsdcBalance();
        } catch (err: any) {
            console.error('Sell error:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            throw err;
        } finally {
            setIsSelling(false);
        }
    };

    const twitterAccount = user?.linked_accounts?.find((a: any) => a.type === 'twitter_oauth');
    const rawProfileImageUrl = (twitterAccount as any)?.profile_picture_url;
    const profileImageUrl = rawProfileImageUrl?.replace('_normal', '');

    const privyUsernameSource =
        user?.linked_accounts?.find(
            (a: any) => a.type === 'twitter_oauth' || a.type === 'google_oauth' || a.type === 'email'
        ) as any;
    const privyUsernameRaw =
        privyUsernameSource?.username ||
        privyUsernameSource?.name ||
        privyUsernameSource?.email?.split('@')[0];
    const username = (privyUsernameRaw || profileData?.displayName || "user").toLowerCase().replace(/\s/g, '');
    const followerCount = profileData?.followerCount || 0;
    const followingCount = profileData?.followingCount || 0;
    const usdBalance = solBalance !== null && solUsdPrice !== null ? solBalance * solUsdPrice : null;
    const cashBalance = usdcBalance ?? usdBalance ?? 0;


    if (isLoading) {
        return (
            <View className="flex-1 bg-app-bg">
                <SafeAreaView className="flex-1" edges={['top']}>
                    <ProfileSkeleton />
                </SafeAreaView>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-app-bg">
            <SafeAreaView className="flex-1" edges={['top']}>
                <ScrollView
                    className="flex-1"
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: 80 }}
                >
                    {/* Profile Header */}
                    <View className="mb-6  ">
                        {/* Menu Button */}
                        <View className="items-end mb-5">
                            <TouchableOpacity
                                className="justify-center items-center"
                                onPress={() => setSettingsVisible(true)}
                            >
                                <Ionicons name="menu-outline" size={30} color={Theme.textSecondary} />
                            </TouchableOpacity>
                        </View>

                        {/* Avatar + Info Row */}
                        <View className="flex-row items-start gap-4 pt-4 mb-4">
                            {/* Avatar */}
                            <View className="relative">
                                <View className="w-14 h-14 rounded-full bg-app-card justify-center items-center overflow-hidden">
                                    <Image
                                        source={profileImageUrl ? { uri: profileImageUrl } : defaultProfileImage}
                                        className="w-full h-full rounded-full"
                                    />
                                </View>
                            </View>

                            {/* Profile Info */}
                            <View className="flex-1 pt-1">
                                <View className="flex-row items-center mb-3">
                                    <Text className="text-xl font-bold text-txt-primary">{username}</Text>

                                    <TouchableOpacity
                                        className="flex-row ml-20 items-center gap-1.5 px-3.5 py-[7px]  rounded-md  bg-slate-200 "
                                        onPress={() => {
                                            if (backendUser?.walletAddress) {
                                                fundWallet({ asset: 'USDC', address: backendUser.walletAddress, amount: "10" });
                                            }
                                        }}
                                    >
                                        <Text className="text-[15px] font-medium   text-txt-primary">+ Add Cash</Text>
                                    </TouchableOpacity>
                                </View>

                                <View className="flex-row gap-5 ">
                                    <TouchableOpacity onPress={() => {
                                        if (backendUser?.id) {
                                            router.push({ pathname: '/user/followers/[userId]', params: { userId: backendUser.id, tab: 'followers' } });
                                        }
                                    }}>
                                        <Text className="text-base text-txt-secondary">
                                            <Text className="font-semibold text-txt-primary">{followerCount}</Text> Followers
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => {
                                        if (backendUser?.id) {
                                            router.push({ pathname: '/user/followers/[userId]', params: { userId: backendUser.id, tab: 'following' } });
                                        }
                                    }}>
                                        <Text className="text-base text-txt-secondary">
                                            <Text className="font-semibold text-txt-primary">{followingCount}</Text> Following
                                        </Text>
                                    </TouchableOpacity>
                                </View>

                            </View>
                        </View>
                    </View>

                    {/* Credit Card */}
                    <View className="my-3">
                        <View
                            style={{
                                transform: [{ scale: 0.9 }],
                                alignSelf: 'center',
                                backgroundColor: Theme.bgMain,
                                borderRadius: 20,
                                shadowColor: Theme.shadowColor,
                                shadowOffset: { width: 0, height: 10 },
                                shadowOpacity: 0.22,
                                shadowRadius: 20,
                                elevation: 10,
                            }}
                        >
                            <CreditCard
                                tradesCount={trades.length}
                                balance={cashBalance}
                                walletAddress={walletAddress || ""}
                                wallet={solanaWallet}
                                walletProvider={walletProvider}
                                connection={connection}
                                onWithdrawSuccess={(amount) => {
                                    // Optimistic update — instant balance feedback
                                    setUsdcBalance(prev => Math.max(0, (prev ?? 0) - amount));
                                    loadUsdcBalance(); // background sync
                                }}
                            />
                        </View>
                    </View>

                    {/* Trades Section */}
                    <View>
                        {/* Clean Tab Header with animated underline */}
                        <View className="mb-5">
                            <View className="flex-row relative border-b border-border/30 pb-1">
                                {/* Animated sliding underline */}
                                <Animated.View
                                    style={{
                                        position: 'absolute',
                                        bottom: -1,
                                        left: 0,
                                        height: 2,
                                        width: tabWidth,
                                        backgroundColor: '#000000',
                                        transform: [{ translateX: indicatorAnim }],
                                    }}
                                />
                                <TouchableOpacity
                                    className="flex-1 items-center py-3 relative"
                                    onPress={() => animateToTab('positions')}
                                    activeOpacity={0.6}
                                >
                                    <View className="flex-row items-center gap-2">
                                        {activeTab === 'positions' && (
                                            <Animated.View
                                                style={{
                                                    width: 8,
                                                    height: 8,
                                                    borderRadius: 4,
                                                    backgroundColor: Theme.success,
                                                    opacity: pulseAnim,
                                                    transform: [{ scale: pulseAnim }],
                                                }}
                                            />
                                        )}
                                        <Text
                                            className="text-base font-bold"
                                            style={{ color: activeTab === 'positions' ? Theme.textPrimary : Theme.textSecondary }}
                                        >
                                            POSITIONS{activeTab === 'positions' ? ` (${displayedCount})` : ''}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className="flex-1 items-center py-3 relative"
                                    onPress={() => animateToTab('copying')}
                                    activeOpacity={0.6}
                                >
                                    <Text
                                        className="text-base font-bold"
                                        style={{ color: activeTab === 'copying' ? Theme.textPrimary : Theme.textSecondary }}
                                    >
                                        COPYING{activeTab === 'copying' ? ` (${copySettings.length})` : ''}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Animated Sliding Lists */}
                        <View style={styles.listContainer}>
                            <Animated.View style={[styles.slidingContainer, { transform: [{ translateX: slideAnim }] }]}>
                                {/* Positions Tab with Filter */}
                                <View style={styles.listPane}>
                                    {activeTab === 'positions' && (
                                        <View className="flex-row items-center justify-between mb-4">
                                            {/* Active / Previous single-toggle pill */}
                                            {(() => {
                                                const isPrevious = positionFilter === 'previous';
                                                const filterColor = isPrevious ? '#FF10F0' : '#00e000';
                                                return (
                                                    <TouchableOpacity
                                                        onPress={togglePositionFilter}
                                                        activeOpacity={0.75}
                                                        style={{
                                                            paddingHorizontal: 12,
                                                            paddingVertical: 8,
                                                            borderRadius: 999,
                                                            flexDirection: 'row',
                                                            alignItems: 'center',
                                                            gap: 6,
                                                        }}
                                                    >
                                                        <Ionicons
                                                            name="ellipse"
                                                            size={10}
                                                            color={filterColor}
                                                        />
                                                        <Text
                                                            className="text-[18px] font-semibold"
                                                            style={{ color: filterColor }}
                                                        >
                                                            {isPrevious ? 'Previous' : 'Active'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })()}

                                            {/* Sort pill with toggle arrow (extreme right) */}
                                            {(() => {
                                                const isUp = sortDirection !== 'losses'; // default / profits = up
                                                const pnlColor =
                                                    sortDirection === 'profits'
                                                        ? '#00e000'
                                                        : sortDirection === 'losses'
                                                            ? '#FF10F0'
                                                            : Theme.textPrimary;
                                                return (
                                                    <TouchableOpacity
                                                        onPress={() => {
                                                            // Only sorts active positions
                                                            setPositionFilter('active');
                                                            setSortDirection((prev) => {
                                                                if (prev === null) return 'profits';
                                                                return prev === 'profits' ? 'losses' : 'profits';
                                                            });
                                                            Haptics.selectionAsync();
                                                        }}
                                                        activeOpacity={0.75}
                                                        style={[
                                                            {
                                                                paddingHorizontal: 12,
                                                                paddingVertical: 8,
                                                                borderRadius: 999,
                                                                flexDirection: 'row',
                                                                alignItems: 'center',
                                                                gap: 6,
                                                            },
                                                        ]}
                                                    >

                                                        <Ionicons
                                                            name={isUp ? 'caret-up-outline' : 'caret-down-outline'}
                                                            size={18}
                                                            color={pnlColor}
                                                        />
                                                        <Text
                                                            className="text-[18px] font-semibold"
                                                            style={{ color: pnlColor }}
                                                        >
                                                            PnL
                                                        </Text>
                                                    </TouchableOpacity>
                                                );
                                            })()}
                                        </View>
                                    )}
                                    <View className="pb-10">
                                        {isLoadingPositions ? (
                                            <PositionsSkeleton />
                                        ) : displayedPositions.length === 0 ? (
                                            <View className="p-10 items-center gap-3">
                                                <Ionicons
                                                    name={positionFilter === 'previous' ? 'time-outline' : 'bar-chart-outline'}
                                                    size={32}
                                                    color={Theme.textDisabled}
                                                />
                                                <Text className="text-sm text-txt-disabled">No positions</Text>
                                            </View>
                                        ) : (
                                            <View className="">
                                                {displayedPositions.map((position, index) => (
                                                    <PositionCard
                                                        key={`${positionFilter}-${position.marketTicker}-${position.side}-${index}`}
                                                        position={position}
                                                        isPrevious={positionFilter === 'previous'}
                                                        eventTitle={position.eventTicker ? eventTitleByTicker[position.eventTicker] : undefined}
                                                        onPress={() => positionFilter !== 'previous'
                                                            ? handleOpenActionSheet(position)
                                                            : handleOpenMarketSheet(position)
                                                        }
                                                    />
                                                ))}
                                            </View>
                                        )}
                                    </View>
                                </View>

                                {/* Copying */}
                                <View style={styles.listPane}>
                                    <View className="pb-10">
                                        {copySettings.length > 0 ? (
                                            <View className="gap-3 p-4">
                                                {copySettings.map((setting) => (
                                                    <View
                                                        key={setting.id}
                                                        className="bg-app-card rounded-xl p-4 border border-border"
                                                    >
                                                        <View className="flex-row items-center justify-between mb-3">
                                                            <View className="flex-row items-center gap-3">
                                                                <View className="w-10 h-10 rounded-full bg-app-elevated items-center justify-center">
                                                                    <Ionicons name="person" size={20} color={Theme.textSecondary} />
                                                                </View>
                                                                <View>
                                                                    <Text className="text-base font-semibold text-txt-primary">
                                                                        {setting.leader?.displayName || `User ${setting.leaderId.slice(0, 8)}...`}
                                                                    </Text>
                                                                    <Text className="text-xs text-txt-secondary">Copying trades</Text>
                                                                </View>
                                                            </View>
                                                            <TouchableOpacity
                                                                onPress={async () => {
                                                                    try {
                                                                        await disableCopyTrading(setting.leaderId);
                                                                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                                                                    } catch (error) {
                                                                        console.error('Failed to stop copy trading:', error);
                                                                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                                                                    }
                                                                }}
                                                                className="px-3 py-1.5 bg-red-500/20 rounded-lg"
                                                            >
                                                                <Text className="text-xs font-medium text-red-500">Stop</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                        <View className="flex-row gap-4">
                                                            <View className="flex-1 bg-app-elevated rounded-lg p-3">
                                                                <Text className="text-xs text-txt-disabled mb-1">Per Trade</Text>
                                                                <Text className="text-lg font-bold text-txt-primary">
                                                                    ${setting.amountPerTrade.toFixed(2)}
                                                                </Text>
                                                            </View>
                                                            <View className="flex-1 bg-app-elevated rounded-lg p-3">
                                                                <Text className="text-xs text-txt-disabled mb-1">Total Cap</Text>
                                                                <Text className="text-lg font-bold text-txt-primary">
                                                                    ${setting.maxTotalAmount.toFixed(2)}
                                                                </Text>
                                                            </View>
                                                        </View>
                                                    </View>
                                                ))}
                                            </View>
                                        ) : (
                                            <View className="p-10 items-center gap-3">
                                                <Ionicons name="copy-outline" size={32} color={Theme.textDisabled} />
                                                <Text className="text-sm text-txt-disabled">Copy trades will appear here</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                            </Animated.View>
                        </View>
                    </View>
                </ScrollView>
            </SafeAreaView>

            <SettingsSheet
                visible={settingsVisible}
                onClose={() => setSettingsVisible(false)}
                onSwitchTheme={() => console.log("Switch theme clicked")}
                onLogout={handleLogout}
            />

            <PositionActionSheet
                visible={actionSheetVisible}
                onClose={() => {
                    setActionSheetVisible(false);
                    setSelectedActionPosition(null);
                }}
                position={selectedActionPosition}
                onViewMarket={(ticker) => router.push({ pathname: '/market/[ticker]', params: { ticker } })}
                onSell={(position) => handleOpenSell(position)}
            />

            <SellPositionSheet
                visible={sellSheetVisible}
                onClose={() => {
                    setSellSheetVisible(false);
                    setSelectedPosition(null);
                }}
                onSell={handleSell}
                submitting={isSelling}
                position={selectedPosition}
            />

            <TradeQuoteSheet
                visible={showQuoteSheet && !!lastTradeInfo}
                onClose={() => {
                    setShowQuoteSheet(false);
                    setLastTradeId(null);
                    loadPositions();
                    loadUsdcBalance();
                }}
                onSubmit={async (quoteText: string) => {
                    await finalizeTrade(quoteText);
                }}
                onSkip={() => {
                    setShowQuoteSheet(false);
                    setLastTradeId(null);
                    loadPositions();
                    loadUsdcBalance();
                }}
                tradeInfo={lastTradeInfo || { side: 'yes', amount: '0', marketTitle: 'Market' }}
            />
            <MarketTradeSheet
                visible={marketSheetVisible}
                onClose={handleCloseMarketSheet}
                onTradeSuccess={() => {
                    loadPositions();
                    loadUsdcBalance();
                    loadTrades();
                }}
                market={selectedMarket}
                backendUser={backendUser || null}
                walletProvider={walletProvider}
                connection={connection}
                eventTitle={selectedMarketEventTitle}
            />
        </View >
    );
}

// Minimal styles for animated components requiring exact dimensions
const styles = StyleSheet.create({
    listContainer: {
        width: SCREEN_WIDTH - 40,
        overflow: 'hidden',
    },
    slidingContainer: {
        flexDirection: 'row',
        width: (SCREEN_WIDTH - 40) * 2,
    },
    listPane: {
        width: SCREEN_WIDTH - 40,
    },
});