import CopySettingsModal from "@/components/CopySettingsModal";
import CopyTradeSheet from "@/components/CopyTradeSheet";
import { MarketTradeSheet } from "@/components/MarketTradeSheet";
import PositionCard from "@/components/PositionCard";
import SellPositionSheet from "@/components/SellPositionSheet";
import SendSheet from "@/components/SendSheet";
import { PositionsSkeleton, UserProfileSkeleton } from "@/components/skeletons";
import TradeQuoteSheet from "@/components/TradeQuoteSheet";
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { useCopyTrading } from "@/hooks/useCopyTrading";
import { api, getEventDetails, getMarketDetails, marketsApi } from "@/lib/api";
import { executeTrade, sendUSDC, toRawAmount } from "@/lib/tradeService";
import { AggregatedPosition, CandleData, Event, Market, Trade, User } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { clusterApiUrl, Connection, PublicKey } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const defaultProfileImage = require("@/assets/default.jpeg");

type TabType = 'active' | 'previous';

const formatCurrency = (value: number | null | undefined, fractionDigits = 2) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `$${value.toFixed(fractionDigits)}`;
};

const formatPercent = (value: number | null | undefined) => {
    if (value === null || value === undefined || !Number.isFinite(value)) return '—';
    return `${value.toFixed(1)}%`;
};


interface TradeWithMarket extends Trade {
    marketDetails?: Market;
}



// Helper functions for PnL calculations
const getPriceChange = (candles: CandleData[]) => {
    if (!candles || candles.length < 2) return null;
    const latest = candles[candles.length - 1];
    const first = candles[0];
    const change = latest.close - first.close;
    const changePercent = first.close > 0 ? (change / first.close) * 100 : 0;
    return {
        change,
        changePercent: changePercent.toFixed(1),
        isPositive: change >= 0,
        currentPrice: latest.close,
    };
};

const getEntryPnl = (candles: CandleData[], entryTimestamp: number, isYes: boolean) => {
    if (!candles || candles.length < 2) return null;
    const latest = candles[candles.length - 1];
    const entryIndex = candles.reduce((closestIndex, candle, index) => {
        const closestDiff = Math.abs(candles[closestIndex].timestamp - entryTimestamp);
        const currentDiff = Math.abs(candle.timestamp - entryTimestamp);
        return currentDiff < closestDiff ? index : closestIndex;
    }, 0);
    const entryPrice = candles[entryIndex]?.close;
    if (!Number.isFinite(entryPrice)) return null;
    const rawChange = latest.close - entryPrice;
    const adjustedChange = isYes ? rawChange : -rawChange;
    const changePercent = entryPrice > 0 ? (adjustedChange / entryPrice) * 100 : 0;
    return {
        change: adjustedChange,
        changePercent: changePercent.toFixed(1),
        isPositive: adjustedChange >= 0,
        currentPrice: latest.close,
        entryPrice,
    };
};

const formatBoughtTime = (createdAt: string) => {
    const created = new Date(createdAt);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfCreated = new Date(created.getFullYear(), created.getMonth(), created.getDate());
    const diffMs = startOfToday.getTime() - startOfCreated.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays <= 0) {
        return created.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    }
    if (diffDays === 1) return '1 day ago';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 14) return 'week ago';
    if (diffDays < 21) return '2 weeks ago';
    if (diffDays < 30) return 'month ago';
    const months = Math.round(diffDays / 30);
    return months <= 1 ? 'month ago' : `${months} months ago`;
};

const formatShortDate = (createdAt: string) => {
    const date = new Date(createdAt);
    return date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

// Premium Trade item component matching profile.tsx style
const TradeItem = ({
    trade,
    onPress,
    market,
    event,
    candles,
    showDetails = false,
    onSell,
    showSellButton = false,
}: {
    trade: TradeWithMarket;
    onPress: () => void;
    market?: Market | null;
    event?: Event | null;
    candles?: CandleData[] | null;
    showDetails?: boolean;
    onSell?: () => void;
    showSellButton?: boolean;
}) => {
    const isYes = trade.side === 'yes';
    const amountValue = Number(trade.amount);

    // Calculate PnL using market prices and trade quote
    let pnlInfo: { changePercent: string; isPositive: boolean } | null = null;

    // Get entry price from trade quote (in cents, 0-100)
    const entryPriceCents = trade.quote ? Number(trade.quote) : null;

    // Get current price from market (in cents, 0-100)
    const currentPriceCents = market
        ? (isYes ? Number(market.yesAsk || 0) : Number(market.noAsk || 0))
        : null;

    if (entryPriceCents && currentPriceCents && entryPriceCents > 0) {
        const priceDiff = currentPriceCents - entryPriceCents;
        const changePercent = (priceDiff / entryPriceCents) * 100;
        pnlInfo = {
            changePercent: changePercent.toFixed(1),
            isPositive: changePercent >= 0,
        };
    } else if (candles && candles.length >= 2) {
        // Fallback to candle-based calculation
        const entryTimestamp = Math.floor(new Date(trade.createdAt).getTime() / 1000);
        const candlePnl = getEntryPnl(candles, entryTimestamp, isYes) || getPriceChange(candles);
        if (candlePnl) {
            pnlInfo = {
                changePercent: candlePnl.changePercent,
                isPositive: candlePnl.isPositive,
            };
        }
    }

    const percentValue = pnlInfo ? Number(pnlInfo.changePercent) : NaN;
    const pnlDollar = Number.isFinite(percentValue) && Number.isFinite(amountValue)
        ? (amountValue * percentValue) / 100
        : NaN;
    const totalValue = Number.isFinite(pnlDollar) && Number.isFinite(amountValue)
        ? Math.max(amountValue + pnlDollar, 0)
        : amountValue;
    const pnlText = pnlInfo && Number.isFinite(pnlDollar)
        ? `${pnlInfo.isPositive ? '+' : ''}$${Math.abs(pnlDollar).toFixed(0)}`
        : '—';
    const pnlColor = pnlInfo ? (pnlInfo.isPositive ? '#32de12' : '#FF10F0') : Theme.textDisabled;
    const gradientColors = pnlInfo
        ? (pnlInfo.isPositive
            ? ['#ECFDF5', '#F0FDF4', '#FFFFFF'] as const
            : ['#FEF2F2', '#FFF1F2', '#FFFFFF'] as const)
        : (['#F8FAFC', '#FFFFFF', '#FFFFFF'] as const);

    return (
        <TouchableOpacity
            className="px-4 py-3"
            onPress={onPress}
            activeOpacity={0.7}
        >
            <View>
                {showDetails && market === undefined && (
                    <Text className="text-[11px] text-txt-disabled mt-1">Loading market details...</Text>
                )}
                {showDetails && market === null && (
                    <Text className="text-[11px] text-txt-disabled mt-1">Market details unavailable</Text>
                )}
                {showDetails && market && (
                    <LinearGradient
                        colors={gradientColors}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={{ borderRadius: 18, padding: 14, borderWidth: 1, borderColor: Theme.border }}
                    >
                        <Text className="absolute right-4 top-3 text-xs text-txt-disabled">
                            {formatBoughtTime(trade.createdAt)}
                        </Text>

                        <View className="flex-row items-center justify-between mb-2">
                            <Text className="text-2xl font-extrabold text-txt-primary">
                                ${Number.isFinite(totalValue) ? totalValue.toFixed(2) : parseFloat(trade.amount).toFixed(2)}
                            </Text>
                            <Text className={`text-2xl font-extrabold ${isYes ? 'text-[#32de12]' : 'text-[#FF10F0]'}`}>
                                {isYes ? 'Yes' : 'No'}
                            </Text>
                        </View>

                        <View className="flex-row items-center justify-between">
                            <Text className="text-base font-semibold text-txt-primary flex-1 pr-3" numberOfLines={2}>
                                {event?.title || market.title}
                            </Text>
                            <View className="w-10 h-10 rounded-md overflow-hidden border border-border">
                                <Image
                                    source={event?.imageUrl ? { uri: event.imageUrl } : defaultProfileImage}
                                    style={{ width: '100%', height: '100%' }}
                                    contentFit="cover"
                                />
                            </View>
                        </View>

                        {(trade.side === 'yes' ? market.yesSubTitle : market.noSubTitle) ? (
                            <Text className="text-sm italic text-txt-secondary mt-1" numberOfLines={1}>
                                on {trade.side === 'yes' ? market.yesSubTitle : market.noSubTitle}
                            </Text>
                        ) : null}

                        <View className="flex-row items-end justify-between mt-3">
                            <Text className="text-xs text-txt-disabled">
                                {formatShortDate(trade.createdAt)}
                            </Text>
                            <Text className="text-xl font-bold" style={{ color: pnlColor }}>
                                {pnlText}
                            </Text>
                        </View>

                        {/* Sell Button for own profile's active positions */}
                        {showSellButton && onSell && market && (
                            <TouchableOpacity
                                className="mt-3 bg-[#FF10F0]/10 rounded-xl py-2.5 flex-row items-center justify-center gap-2 border border-[#FF10F0]/20"
                                onPress={(e) => {
                                    e.stopPropagation();
                                    onSell();
                                }}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="trending-down" size={16} color="#FF10F0" />
                                <Text className="text-[#FF10F0] font-semibold text-sm">Sell Position</Text>
                            </TouchableOpacity>
                        )}
                    </LinearGradient>
                )}
            </View>
        </TouchableOpacity>
    );
};

const sendBtnStyle = StyleSheet.create({
    btn: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: 'yellow',
    },
    btnFlex: {
        flex: 1,
    },
    text: {
        fontSize: 14,
        fontWeight: '700',
        color: '#11181C',
    },
});

export default function UserProfileScreen() {
    const { userId } = useLocalSearchParams<{ userId: string }>();
    const { backendUser: currentUser } = useUser();
    const { wallets } = useEmbeddedSolanaWallet();
    const insets = useSafeAreaInsets();

    const [profile, setProfile] = useState<User | null>(null);
    const [trades, setTrades] = useState<TradeWithMarket[]>([]);
    const [positions, setPositions] = useState<{ active: AggregatedPosition[]; previous: AggregatedPosition[] }>({
        active: [],
        previous: [],
    });
    const [eventTitleByTicker, setEventTitleByTicker] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [tradesLoading, setTradesLoading] = useState(false);
    const [isLoadingPositions, setIsLoadingPositions] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [activeTab, setActiveTab] = useState<TabType>('active');
    const [eventDetailsByTicker, setEventDetailsByTicker] = useState<Record<string, Event | null>>({});
    const [candlesByTicker, setCandlesByTicker] = useState<Record<string, CandleData[]>>({});

    // Sell position state
    const [sellSheetVisible, setSellSheetVisible] = useState(false);
    const [selectedPosition, setSelectedPosition] = useState<AggregatedPosition | null>(null);
    const [isSelling, setIsSelling] = useState(false);

    // Quote sheet state
    const [showQuoteSheet, setShowQuoteSheet] = useState(false);
    const [lastTradeInfo, setLastTradeInfo] = useState<{ side: 'yes' | 'no'; amount: string; marketTitle: string } | null>(null);
    const [lastTradeId, setLastTradeId] = useState<string | null>(null);
    const [copySheetVisible, setCopySheetVisible] = useState(false);
    const [usdcBalance, setUsdcBalance] = useState<number>(0);

    // Copy trading hook
    const { enableCopyTrading, isLoading: copyTradingLoading, isSigningDelegation, fetchAllCopySettings, copySettings } = useCopyTrading();
    const [copyModalVisible, setCopyModalVisible] = useState(false);
    const [isCopying, setIsCopying] = useState(false);

    // Market Sheet state
    const [marketSheetVisible, setMarketSheetVisible] = useState(false);
    const [selectedMarket, setSelectedMarket] = useState<Market | null>(null);
    const [selectedMarketEventTitle, setSelectedMarketEventTitle] = useState<string | undefined>(undefined);
    const [walletProvider, setWalletProvider] = useState<any>(null);

    // Send USDC sheet state
    const [sendSheetOpen, setSendSheetOpen] = useState(false);
    const [sendSubmitting, setSendSubmitting] = useState(false);

    const tradeStats = useMemo(() => {
        if (!trades || trades.length === 0) {
            return {
                totalPnl: 0,
                totalBets: 0,
                winRate: null as number | null,
            };
        }

        let realizedPnl = 0;
        let betsWithPnl = 0;
        let wins = 0;

        for (const trade of trades) {
            const amountValue = Number(trade.amount);
            const market = (trade as TradeWithMarket).marketDetails;
            const entryPriceCents = trade.quote ? Number(trade.quote) : null;

            if (
                !market ||
                !Number.isFinite(amountValue) ||
                !entryPriceCents ||
                !Number.isFinite(entryPriceCents) ||
                entryPriceCents <= 0
            ) {
                continue;
            }

            const isYes = trade.side === 'yes';
            const currentPriceCents = isYes
                ? Number(market.yesAsk || 0)
                : Number(market.noAsk || 0);

            if (!Number.isFinite(currentPriceCents) || currentPriceCents <= 0) {
                continue;
            }

            const priceDiff = currentPriceCents - entryPriceCents;
            const changePercent = (priceDiff / entryPriceCents) * 100;
            const pnlDollar = (amountValue * changePercent) / 100;

            if (!Number.isFinite(pnlDollar)) {
                continue;
            }

            realizedPnl += pnlDollar;
            betsWithPnl += 1;
            if (pnlDollar > 0) {
                wins += 1;
            }
        }

        const winRate =
            betsWithPnl > 0 ? (wins / betsWithPnl) * 100 : null;

        return {
            totalPnl: realizedPnl,
            totalBets: trades.length,
            winRate,
        };
    }, [trades]);

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
        if (position.eventTicker) {
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

    const slideAnim = useRef(new Animated.Value(0)).current;
    const loadedEventTickers = useRef(new Set<string>());
    const loadedCandleTickers = useRef(new Set<string>());

    // Solana connection for trading
    const connection = useMemo(() => {
        const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
        return new Connection(rpcUrl, 'confirmed');
    }, []);

    const solanaWallet = wallets?.[0];

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

    const animateToTab = useCallback((tab: TabType) => {
        Animated.spring(slideAnim, {
            toValue: tab === 'active' ? 0 : -SCREEN_WIDTH + 40,
            useNativeDriver: true,
            tension: 50,
            friction: 7,
        }).start();
        setActiveTab(tab);
    }, [slideAnim]);

    const isOwnProfile = currentUser?.id === userId;

    const finalizeTrade = async (quote?: string) => {
        if (!lastTradeId) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadTrades();
            loadPositions();
            return;
        }

        if (!quote) {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadTrades();
            loadPositions();
            return;
        }

        try {
            await api.updateTradeQuote(lastTradeId, quote);
        } catch (error) {
            console.error('Failed to update quote:', error);
        } finally {
            setShowQuoteSheet(false);
            setLastTradeId(null);
            loadTrades();
            loadPositions();
        }
    };

    const loadUsdcBalance = useCallback(async () => {
        if (!currentUser?.walletAddress) {
            setUsdcBalance(0);
            return;
        }
        try {
            const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
            const conn = new Connection(rpcUrl, 'confirmed');
            const usdcMint = new PublicKey("EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v");
            const tokenAccounts = await conn.getParsedTokenAccountsByOwner(
                new PublicKey(currentUser.walletAddress),
                { mint: usdcMint }
            );
            const totalBalance = tokenAccounts.value.reduce((sum, accountInfo) => {
                const amount = accountInfo.account.data?.parsed?.info?.tokenAmount?.uiAmount;
                return sum + (typeof amount === 'number' ? amount : 0);
            }, 0);
            setUsdcBalance(totalBalance);
        } catch (error) {
            console.error("Failed to load USDC balance:", error);
            setUsdcBalance(0);
        }
    }, [currentUser?.walletAddress]);

    useEffect(() => {
        if (copySettings && userId) {
            setIsCopying(copySettings.some(s => s.leaderId === userId));
        }
    }, [copySettings, userId]);

    const loadProfile = async () => {
        try {
            setLoading(true);
            setError(null);
            const data = await api.getUser(userId as string);
            setProfile(data);
        } catch (err: any) {
            console.error("Failed to fetch profile:", err);
            setError(err.message || "Failed to load profile");
        } finally {
            setLoading(false);
        }
    };

    const loadTrades = async () => {
        try {
            setTradesLoading(true);
            const data = await api.getUserTrades(userId as string, 50);
            const tickers = [...new Set(data.map((t) => t.marketTicker))];
            const markets = await Promise.all(tickers.map((t) => getMarketDetails(t)));
            const marketMap = new Map(tickers.map((t, i) => [t, markets[i]]));
            const withMarkets = data.map((t) => ({
                ...t,
                marketDetails: marketMap.get(t.marketTicker) ?? undefined,
            }));
            setTrades(withMarkets);
        } catch (err) {
            console.error("Failed to fetch trades:", err);
        } finally {
            setTradesLoading(false);
        }
    };

    const loadPositions = async () => {
        try {
            setIsLoadingPositions(true);
            const data = await api.getPositions(userId as string);
            setPositions(data.positions);
        } catch (err) {
            console.error("Failed to fetch positions:", err);
        } finally {
            setIsLoadingPositions(false);
        }
    };

    useEffect(() => {
        if (!userId) return;
        let cancelled = false;
        const run = async () => {
            try {
                await Promise.all([
                    (async () => {
                        const data = await api.getUser(userId as string);
                        if (!cancelled) setProfile(data);
                    })(),
                    (async () => {
                        const data = await api.getUserTrades(userId as string, 50);
                        const tickers = [...new Set(data.map((t) => t.marketTicker))];
                        const markets = await Promise.all(tickers.map((t) => getMarketDetails(t)));
                        const marketMap = new Map(tickers.map((t, i) => [t, markets[i]]));
                        const withMarkets = data.map((t) => ({
                            ...t,
                            marketDetails: marketMap.get(t.marketTicker) ?? undefined,
                        }));
                        if (!cancelled) setTrades(withMarkets);
                    })(),
                    (async () => {
                        const data = await api.getPositions(userId as string);
                        if (!cancelled) setPositions(data.positions);
                    })(),
                ]);
            } catch (err: any) {
                if (!cancelled) setError(err?.message || "Failed to load profile");
            } finally {
                if (!cancelled) setLoading(false);
                if (!cancelled) setTradesLoading(false);
                if (!cancelled) setIsLoadingPositions(false);
                if (!cancelled) {
                    if (currentUser && !isOwnProfile) {
                        checkFollowStatus();
                        fetchAllCopySettings();
                    }
                    loadUsdcBalance();
                }
            }
        };
        setLoading(true);
        setTradesLoading(true);
        setIsLoadingPositions(true);
        run();
        return () => { cancelled = true; };
    }, [userId]);

    const checkFollowStatus = async () => {
        if (!currentUser) return;
        try {
            const following = await api.getFollowing(currentUser.id);
            setIsFollowing(following.some(f => f.followingId === userId));
        } catch (err) {
            console.error("Failed to check follow status:", err);
        }
    };

    const handleFollow = async () => {
        if (!currentUser || isOwnProfile || followLoading) return;
        const wasFollowing = isFollowing;
        setIsFollowing(!wasFollowing);
        setFollowLoading(true);
        try {
            if (wasFollowing) {
                await api.unfollowUser(userId as string);
                setProfile(prev => prev ? { ...prev, followerCount: Math.max(0, prev.followerCount - 1) } : prev);
            } else {
                await api.followUser(userId as string);
                setProfile(prev => prev ? { ...prev, followerCount: prev.followerCount + 1 } : prev);
            }
        } catch (error) {
            console.error("Failed to follow/unfollow:", error);
            setIsFollowing(wasFollowing);
        } finally {
            setFollowLoading(false);
        }
    };

    // Handle opening sell sheet
    const handleOpenSell = (position: AggregatedPosition) => {
        console.log('[DEBUG] Opening sell sheet for position:', {
            marketTicker: position.marketTicker,
            side: position.side,
            totalTokensBought: position.totalTokensBought,
            totalTokensSold: position.totalTokensSold,
            totalTokenAmount: position.totalTokenAmount,
            currentPrice: position.currentPrice,
            market: position.market ? 'loaded' : 'null',
        });
        setSelectedPosition(position);
        setSellSheetVisible(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    // Handle sell trade execution - sells all tokens for this position
    const handleSell = async () => {
        if (!selectedPosition || !currentUser || !solanaWallet) {
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

            const rawAmount = toRawAmount(tokensToSell, 6);
            const provider = await solanaWallet.getProvider();

            const { signature, order } = await executeTrade({
                provider,
                connection,
                userPublicKey: currentUser.walletAddress,
                amount: rawAmount,
                marketId: selectedPosition.marketTicker,
                isYes: selectedPosition.side === 'yes',
                isBuy: false,
                positionPubkey: (selectedPosition as any).positionPubkey,
                slippageBps: 100,
            });

            const usdcReceived = (parseInt(order.outAmount) / 1_000_000).toFixed(2);

            const tradeData = {
                userId: currentUser.id,
                marketTicker: selectedPosition.marketTicker,
                eventTicker: selectedPosition.eventTicker || undefined,
                side: selectedPosition.side,
                action: 'SELL' as const,
                amount: usdcReceived,
                walletAddress: currentUser.walletAddress,
                transactionSig: signature,
                executedInAmount: order.inAmount,
                executedOutAmount: order.outAmount,
                isDummy: true,
            };

            const savedTrade = await api.createTrade(tradeData);

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setSellSheetVisible(false);

            setLastTradeId(savedTrade.id);
            setLastTradeInfo({
                side: selectedPosition.side,
                amount: usdcReceived,
                marketTitle: selectedPosition.market?.title || selectedPosition.marketTicker,
            });
            setShowQuoteSheet(true);

            setSelectedPosition(null);
            loadTrades();
            loadPositions();
        } catch (err: any) {
            console.error('Sell error:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            throw err;
        } finally {
            setIsSelling(false);
        }
    };

    // Load event details for trades
    useEffect(() => {
        const eventTickers = trades
            .map((trade) => trade.marketDetails?.eventTicker)
            .filter((ticker): ticker is string => !!ticker);
        const uniqueEventTickers = Array.from(new Set(eventTickers));
        const tickersToFetch = uniqueEventTickers.filter((ticker) => !loadedEventTickers.current.has(ticker));
        if (tickersToFetch.length === 0) return;

        let cancelled = false;
        const loadEvents = async () => {
            const results = await Promise.all(
                tickersToFetch.map(async (ticker) => ({
                    ticker,
                    event: await marketsApi.fetchEventDetails(ticker).catch(() => null),
                }))
            );
            if (cancelled) return;
            setEventDetailsByTicker((prev) => {
                const next = { ...prev };
                results.forEach(({ ticker, event }) => {
                    loadedEventTickers.current.add(ticker);
                    next[ticker] = event;
                });
                return next;
            });
        };
        loadEvents();
        return () => {
            cancelled = true;
        };
    }, [trades]);

    useEffect(() => {
        const activeTrades = trades
            .filter((trade) => trade.marketDetails?.status === 'active')
            .map((trade) => ({
                marketTicker: trade.marketTicker,
                eventTicker: trade.marketDetails?.eventTicker || trade.eventTicker,
            }));
        const uniqueByTicker = new Map<string, string | undefined>();
        activeTrades.forEach(({ marketTicker, eventTicker }) => {
            if (!uniqueByTicker.has(marketTicker)) {
                uniqueByTicker.set(marketTicker, eventTicker);
            }
        });
        const uniqueTickers = Array.from(uniqueByTicker.entries()).map(([ticker, seriesTicker]) => ({
            ticker,
            seriesTicker,
        }));
        const tickersToFetch = uniqueTickers.filter(({ ticker }) => !loadedCandleTickers.current.has(ticker));
        if (tickersToFetch.length === 0) return;

        let cancelled = false;
        const loadCandles = async () => {
            const results = await Promise.all(
                tickersToFetch.map(async ({ ticker, seriesTicker }) => ({
                    ticker,
                    candles: await marketsApi.fetchCandlesticksByMint({
                        ticker,
                        seriesTicker,
                    }).catch(() => [] as CandleData[]),
                }))
            );
            if (cancelled) return;
            setCandlesByTicker((prev) => {
                const next = { ...prev };
                results.forEach(({ ticker, candles }) => {
                    loadedCandleTickers.current.add(ticker);
                    next[ticker] = candles;
                });
                return next;
            });
        };
        loadCandles();
        return () => {
            cancelled = true;
        };
    }, [trades]);

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

    if (loading) {
        return (
            <View className="flex-1 bg-app-bg">
                <SafeAreaView className="flex-1">
                    <UserProfileSkeleton />
                </SafeAreaView>
            </View>
        );
    }

    if (error || !profile) {
        return (
            <View className="flex-1 bg-app-bg">
                <SafeAreaView className="flex-1">
                    <View className="flex-1 justify-center items-center px-10">
                        <Ionicons name="alert-circle-outline" size={64} color={Theme.error} />
                        <Text className="text-status-error text-base mt-4 mb-3 text-center">{error || "User not found"}</Text>
                        <TouchableOpacity className="bg-app-card py-2.5 px-5 rounded-lg" onPress={loadProfile}>
                            <Text className="text-txt-primary text-sm font-semibold">Retry</Text>
                        </TouchableOpacity>
                    </View>
                </SafeAreaView>
            </View>
        );
    }

    const username = profile.username
        ? (profile.username.startsWith('@') ? profile.username : `@${profile.username}`)
        : `${profile.walletAddress.slice(0, 6)}...${profile.walletAddress.slice(-4)}`;
    const profileImageUrl = profile.avatarUrl?.replace('_normal', '');

    return (
        <View className="flex-1 bg-app-bg">
            <SafeAreaView className="flex-1" edges={['top']}>
                <ScrollView
                    contentContainerStyle={{
                        paddingTop: 40,
                        paddingHorizontal: 20,
                        paddingBottom: (!isOwnProfile && currentUser && isFollowing) ? insets.bottom + 88 : 24,
                    }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Profile Row */}
                    <View className="flex-row items-start gap-4 mb-4">
                        {/* Avatar */}
                        <View className="w-14 h-14 rounded-full bg-app-card justify-center items-center overflow-hidden">
                            <Image
                                source={profileImageUrl ? { uri: profileImageUrl } : defaultProfileImage}
                                style={{ width: '100%', height: '100%', borderRadius: 28 }}
                                contentFit="cover"
                            />
                        </View>

                        {/* Info */}
                        <View className="flex-1 pt-1">
                            <View className="flex-row items-center justify-between mb-2.5 gap-3">
                                <Text className="text-xl font-bold text-txt-primary flex-1" numberOfLines={1}>{username}</Text>


                            </View>

                            <View className="flex-row gap-5">
                                <TouchableOpacity onPress={() => router.push({ pathname: '/user/followers/[userId]', params: { userId: userId as string, tab: 'followers' } })}>
                                    <Text className="text-base text-txt-secondary">
                                        <Text className="font-semibold text-txt-primary">{profile.followerCount || 0}</Text> Followers
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => router.push({ pathname: '/user/followers/[userId]', params: { userId: userId as string, tab: 'following' } })}>
                                    <Text className="text-base text-txt-secondary">
                                        <Text className="font-semibold text-txt-primary">{profile.followingCount || 0}</Text> Following
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            {!isOwnProfile && currentUser && (
                                <View className="mt-4 flex-row gap-3 items-center">
                                    {/* Follow / Friends icon */}
                                    {isFollowing ? (
                                        // Already following — show friends icon, no text button
                                        <View
                                            style={{
                                                width: 40,
                                                height: 40,
                                                borderRadius: 20,
                                                backgroundColor: '#F3F4F6',
                                                justifyContent: 'center',
                                                alignItems: 'center',
                                            }}
                                        >
                                            <Ionicons name="people" size={20} color="#11181C" />
                                        </View>
                                    ) : (
                                        // Not following — show Follow button
                                        <TouchableOpacity
                                            className="flex-1 flex-row justify-center items-center gap-1.5 px-3 py-2.5 rounded-xl bg-black"
                                            onPress={handleFollow}
                                            disabled={followLoading}
                                        >
                                            {followLoading ? (
                                                <ActivityIndicator size="small" color="white" />
                                            ) : (
                                                <Text className="text-sm font-semibold text-white">Follow</Text>
                                            )}
                                        </TouchableOpacity>
                                    )}

                                    {/* Send USDC button — always shown inline (yellow CTA) */}
                                    {profile?.walletAddress && (
                                        <TouchableOpacity
                                            style={[sendBtnStyle.btn, isFollowing && sendBtnStyle.btnFlex]}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setSendSheetOpen(true);
                                            }}
                                            activeOpacity={0.8}
                                        >
                                            <Ionicons name="send" size={15} color="#11181C" />
                                            <Text style={sendBtnStyle.text}>Send</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            )}

                            <View className="flex-row mt-3 bg-app-card rounded-2xl px-3 py-2 border border-border/40">
                                <View className="flex-1">
                                    <Text className="text-[11px] text-txt-secondary mb-0.5">Total PnL</Text>
                                    <Text
                                        className={`text-[15px] font-semibold ${
                                            tradeStats.totalPnl > 0
                                                ? 'text-green-500'
                                                : tradeStats.totalPnl < 0
                                                ? 'text-[#FF10F0]'
                                                : 'text-txt-primary'
                                        }`}
                                    >
                                        {tradeStats.totalPnl === 0
                                            ? '$0'
                                            : `${tradeStats.totalPnl > 0 ? '+' : '-'}$${Math.abs(tradeStats.totalPnl).toFixed(0)}`}
                                    </Text>
                                </View>
                                <View className="w-px bg-border/40 mx-2" />
                                <View className="flex-1">
                                    <Text className="text-[11px] text-txt-secondary mb-0.5">Total Bets</Text>
                                    <Text className="text-[15px] font-semibold text-txt-primary">
                                        {tradeStats.totalBets}
                                    </Text>
                                </View>
                                <View className="w-px bg-border/40 mx-2" />
                                <View className="flex-1">
                                    <Text className="text-[11px] text-txt-secondary mb-0.5">Win Rate</Text>
                                    <Text className="text-[15px] font-semibold text-txt-primary">
                                        {tradeStats.winRate === null
                                            ? '—'
                                            : `${tradeStats.winRate.toFixed(0)}%`}
                                    </Text>
                                </View>
                            </View>
                        </View>
                    </View>

                    <View className="h-5" />

                    {/* Trades */}
                    <View className="flex-1">
                        {/* Tab Header - segmented control */}
                        <View className="mb-4">
                            <View className="flex-row bg-app-card rounded-2xl p-1 border border-border/40">
                                <TouchableOpacity
                                    className={`flex-1 py-2.5 rounded-xl items-center ${
                                        activeTab === 'active' ? 'bg-black' : ''
                                    }`}
                                    onPress={() => animateToTab('active')}
                                    activeOpacity={0.85}
                                >
                                    <Text
                                        className={`text-sm font-semibold ${
                                            activeTab === 'active' ? 'text-white' : 'text-txt-secondary'
                                        }`}
                                    >
                                        Active ({activePositions.length})
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    className={`flex-1 py-2.5 rounded-xl items-center ${
                                        activeTab === 'previous' ? 'bg-black' : ''
                                    }`}
                                    onPress={() => animateToTab('previous')}
                                    activeOpacity={0.85}
                                >
                                    <Text
                                        className={`text-sm font-semibold ${
                                            activeTab === 'previous' ? 'text-white' : 'text-txt-secondary'
                                        }`}
                                    >
                                        Previous ({previousPositions.length})
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        {/* Sliding Lists */}
                        <View style={styles.listContainer}>
                            <Animated.View style={[styles.slidingContainer, { transform: [{ translateX: slideAnim }] }]}>
                                {/* Active */}
                                <View style={styles.listPane}>
                                    {isLoadingPositions ? (
                                        <PositionsSkeleton />
                                    ) : activePositions.length === 0 ? (
                                        <View className="p-10 items-center gap-3">
                                            <Ionicons name="bar-chart-outline" size={32} color={Theme.textDisabled} />
                                            <Text className="text-sm text-txt-disabled">No active positions</Text>
                                        </View>
                                    ) : (
                                        <View className="">
                                            {activePositions.map((position) => (
                                                <PositionCard
                                                    key={`${position.marketTicker}-${position.side}`}
                                                    position={position}
                                                    eventTitle={position.eventTicker ? eventTitleByTicker[position.eventTicker] : undefined}
                                                    onPress={() => handleOpenMarketSheet(position)}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </View>

                                {/* Previous */}
                                <View style={styles.listPane}>
                                    {isLoadingPositions ? (
                                        <PositionsSkeleton />
                                    ) : previousPositions.length === 0 ? (
                                        <View className="p-10 items-center gap-3">
                                            <Ionicons name="time-outline" size={32} color={Theme.textDisabled} />
                                            <Text className="text-sm text-txt-disabled">No previous positions</Text>
                                        </View>
                                    ) : (
                                        <View className="">
                                            {previousPositions.map((position) => (
                                                <PositionCard
                                                    key={`${position.marketTicker}-${position.side}`}
                                                    position={position}
                                                    isPrevious
                                                    eventTitle={position.eventTicker ? eventTitleByTicker[position.eventTicker] : undefined}
                                                    onPress={() => handleOpenMarketSheet(position)}
                                                />
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </Animated.View>
                        </View>
                    </View>

                </ScrollView>
            </SafeAreaView>

            {/* Fixed Copy Trade button at bottom center (only when viewing another user and following) */}
            {!isOwnProfile && currentUser && isFollowing && (
                <View
                    style={{
                        position: 'absolute',
                        bottom: 0,
                        left: 0,
                        right: 0,
                        paddingBottom: insets.bottom + 16,
                        alignItems: 'center',
                    }}
                    pointerEvents="box-none"
                >
                    <TouchableOpacity
                        className={`flex-row items-center gap-2 px-6 py-3.5 rounded-xl ${isCopying ? 'bg-green-500' : 'bg-black'}`}
                        onPress={() => {
                            Haptics.selectionAsync();
                            setCopyModalVisible(true);
                        }}
                        activeOpacity={0.8}
                    >
                        <Ionicons name={isCopying ? "checkmark-circle" : "copy-outline"} size={18} color="white" />
                        <Text className="text-base font-semibold text-white">{isCopying ? 'Copying' : 'Copy Trade'}</Text>
                    </TouchableOpacity>
                </View>
            )}

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
                    loadTrades();
                }}
                onSubmit={async (quoteText) => {
                    await finalizeTrade(quoteText);
                }}
                onSkip={() => {
                    setShowQuoteSheet(false);
                    setLastTradeId(null);
                    loadTrades();
                }}
                tradeInfo={lastTradeInfo || { side: 'yes', amount: '0', marketTitle: 'Market' }}
            />

            <CopyTradeSheet
                visible={copySheetVisible}
                onClose={() => setCopySheetVisible(false)}
                username={username}
                balance={usdcBalance}
                loading={copyTradingLoading || isSigningDelegation}
                onConfirm={async (perTrade, totalCap) => {
                    try {
                        await enableCopyTrading(
                            userId as string,
                            username,
                            {
                                amountPerTrade: parseFloat(perTrade),
                                maxTotalAmount: parseFloat(totalCap),
                            }
                        );
                        setCopySheetVisible(false);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                    } catch (error: any) {
                        console.error('Failed to enable copy trading:', error);
                        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                    }
                }}
            />
            {/* Copy Settings Modal */}
            <CopySettingsModal
                isOpen={copyModalVisible}
                onClose={() => setCopyModalVisible(false)}
                leaderId={userId as string}
                leaderName={username || 'User'}
                onSave={() => {
                    fetchAllCopySettings();
                    setCopyModalVisible(false);
                }}
            />
            <MarketTradeSheet
                visible={marketSheetVisible}
                onClose={handleCloseMarketSheet}
                onTradeSuccess={() => {
                    loadTrades();
                    loadPositions();
                    loadUsdcBalance();
                }}
                market={selectedMarket}
                backendUser={currentUser || null}
                walletProvider={walletProvider}
                connection={connection}
                eventTitle={selectedMarketEventTitle}
            />

            {/* Send USDC Sheet */}
            {profile && (
                <SendSheet
                    visible={sendSheetOpen}
                    onClose={() => setSendSheetOpen(false)}
                    submitting={sendSubmitting}
                    balance={usdcBalance}
                    recipientAddress={profile.walletAddress}
                    recipientName={username}
                    onSubmit={async ({ toAddress, amount }) => {
                        if (!currentUser || !solanaWallet) return;
                        try {
                            setSendSubmitting(true);
                            const provider = await solanaWallet.getProvider();
                            await sendUSDC({
                                provider,
                                wallet: solanaWallet,
                                connection,
                                fromAddress: currentUser.walletAddress,
                                toAddress,
                                amount,
                                type: 'send',
                                senderName: currentUser.displayName || currentUser.username || undefined,
                            });
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                            // Optimistic update — instant feedback, no waiting for refetch
                            setUsdcBalance(prev => Math.max(0, prev - amount));
                            setSendSheetOpen(false);
                            loadUsdcBalance(); // background sync with actual chain balance
                        } catch (err: any) {
                            console.error('Send USDC error:', err);
                            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                        } finally {
                            setSendSubmitting(false);
                        }
                    }}
                />
            )}
        </View>
    );
}

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



