import CustomKeypad from "@/components/CustomKeypad";
import { MarketDetailSkeleton } from "@/components/skeletons";
import TradeQuoteSheet from "@/components/TradeQuoteSheet";
import { Theme } from '@/constants/theme';
import { useUser } from "@/contexts/UserContext";
import { api, marketsApi } from "@/lib/api";
import { executeTrade, toRawAmount } from "@/lib/tradeService";
import { Market } from "@/lib/types";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedSolanaWallet } from "@privy-io/expo";
import { Connection, clusterApiUrl } from "@solana/web3.js";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Keyboard, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function MarketDetailScreen() {
  const { ticker } = useLocalSearchParams<{ ticker: string }>();
  const { backendUser } = useUser();
  const { wallets } = useEmbeddedSolanaWallet();
  const [market, setMarket] = useState<Market | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSide, setSelectedSide] = useState<'yes' | 'no'>('yes');
  const [amount, setAmount] = useState('');
  const [isTrading, setIsTrading] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [amountKeypadOpen, setAmountKeypadOpen] = useState(false);
  const [showQuoteSheet, setShowQuoteSheet] = useState(false);
  const [lastTradeId, setLastTradeId] = useState<string | null>(null);

  // Get Solana connection and wallet provider
  const connection = useMemo(() => {
    const rpcUrl = process.env.EXPO_PUBLIC_SOLANA_RPC_URL || clusterApiUrl('mainnet-beta');
    return new Connection(rpcUrl, 'confirmed');
  }, []);

  const solanaWallet = wallets?.[0];

  useEffect(() => {
    if (ticker) loadMarketDetails();
  }, [ticker]);

  const loadMarketDetails = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await marketsApi.fetchMarketDetails(ticker as string);
      setMarket(data);
    } catch (err) {
      console.error("Failed to fetch market details:", err);
      setError("Failed to load market details");
    } finally {
      setLoading(false);
    }
  };

  const handleTrade = async () => {
    if (!market || !backendUser || !amount || parseFloat(amount) <= 0) return;
    if (!solanaWallet) {
      setTradeError("Wallet not connected");
      return;
    }

    Keyboard.dismiss();
    setIsTrading(true);
    setTradeError(null);

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      if (!market.ticker) {
        throw new Error('No market id found for this market');
      }

      // Convert USDC amount to raw (6 decimals)
      const rawAmount = toRawAmount(parseFloat(amount), 6);

      // Get wallet provider
      const provider = await solanaWallet.getProvider();

      // Execute the trade: get quote, sign, send, wait for confirmation
      const { signature, order } = await executeTrade({
        provider,
        connection,
        userPublicKey: backendUser.walletAddress,
        amount: rawAmount,
        marketId: market.ticker,
        isYes: selectedSide === 'yes',
        isBuy: true,
        slippageBps: 100,
      });

      // Save trade to backend with real transaction signature
      const trade = await api.createTrade({
        userId: backendUser.id,
        marketTicker: market.ticker,
        eventTicker: market.eventTicker,
        side: selectedSide,
        action: 'BUY',
        amount: amount,
        walletAddress: backendUser.walletAddress,
        transactionSig: signature,
        executedInAmount: order.inAmount,
        executedOutAmount: order.outAmount,
        isDummy: true,
      });

      setLastTradeId(trade.id);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setShowQuoteSheet(true);
    } catch (err: any) {
      console.error("Trade placement error:", err);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);

      let errorMessage = "Failed to place trade";
      if (err.message?.includes("insufficient") || err.message?.includes("balance")) {
        errorMessage = "Insufficient balance";
      } else if (err.message?.includes("rejected") || err.message?.includes("cancelled") || err.message?.includes("denied")) {
        errorMessage = "Transaction cancelled";
      } else if (err.message?.includes("market")) {
        errorMessage = "Market not available";
      } else if (err.message?.includes("timeout")) {
        errorMessage = "Transaction timeout - check your wallet";
      } else if (err.message) {
        errorMessage = err.message.length > 50 ? err.message.slice(0, 50) + '...' : err.message;
      }
      setTradeError(errorMessage);
    } finally {
      setIsTrading(false);
    }
  };

  const handleQuoteSubmit = async (quote: string) => {
    // Update the trade with the quote
    if (lastTradeId) {
      try {
        await api.updateTradeQuote(lastTradeId, quote);
      } catch (err) {
        console.error("Failed to update quote:", err);
      }
    }
    setShowQuoteSheet(false);
    setAmount('');
    router.back();
  };

  const handleQuoteSkip = () => {
    setShowQuoteSheet(false);
    setAmount('');
    router.back();
  };

  const calculateProbability = () => {
    if (market?.yesBid && market?.yesAsk) {
      return (parseFloat(market.yesBid) + parseFloat(market.yesAsk)) / 2 * 100;
    }
    return 50;
  };

  if (loading) {
    return (
      <View className="flex-1 bg-app-bg">
        <LinearGradient colors={[Theme.bgMain, '#0D1117', Theme.bgCard]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView className="flex-1">
          <MarketDetailSkeleton />
        </SafeAreaView>
      </View>
    );
  }

  if (error || !market) {
    return (
      <View className="flex-1 bg-app-bg">
        <LinearGradient colors={[Theme.bgMain, '#0D1117', Theme.bgCard]} style={StyleSheet.absoluteFillObject} />
        <SafeAreaView className="flex-1">
          <View className="px-5 py-3 flex-row justify-between items-center">
            <TouchableOpacity className="w-10 h-10 rounded-full bg-app-card justify-center items-center border border-border" onPress={() => router.back()}>
              <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
            </TouchableOpacity>
          </View>
          <View className="flex-1 justify-center items-center">
            <Text className="text-status-error text-base mb-3">{error || "Market not found"}</Text>
            <TouchableOpacity className="bg-app-card py-2.5 px-5 rounded-[10px] border border-border" onPress={loadMarketDetails}>
              <Text className="text-txt-primary text-sm font-semibold">Retry</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </View>
    );
  }

  const estimatedProbability = calculateProbability();
  const betAmount = parseFloat(amount || '0');
  const canTrade = betAmount > 0 && !isTrading && backendUser;

  return (
    <View className="flex-1 bg-app-bg">
      <LinearGradient colors={[Theme.bgMain, '#0D1117', Theme.bgCard]} style={StyleSheet.absoluteFillObject} />

      <SafeAreaView className="flex-1">
        {/* Header */}
        <View className="px-5 py-3 flex-row justify-between items-center">
          <TouchableOpacity className="w-10 h-10 rounded-full bg-app-card justify-center items-center border border-border" onPress={() => router.back()}>
            <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
          </TouchableOpacity>
          <TouchableOpacity className="w-10 h-10 rounded-full bg-app-card justify-center items-center border border-border" onPress={loadMarketDetails}>
            <Ionicons name="refresh" size={20} color={Theme.textPrimary} />
          </TouchableOpacity>
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          {/* Market Header */}
          <View className="mb-5">
            <View className="flex-row items-center gap-3 mb-3">
              {market.status === 'active' && (
                <View className="flex-row items-center gap-1.5 bg-cyan-500/10 px-2.5 py-1.5 rounded-lg border border-cyan-500/20">
                  <View className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: Theme.accentSubtle }} />
                  <Text className="text-[11px] font-bold uppercase tracking-wide" style={{ color: Theme.accentSubtle }}>Live</Text>
                </View>
              )}
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="stats-chart" size={14} color={Theme.textSecondary} />
                <Text className="text-txt-secondary text-[13px] font-medium">${((market.volume || 0) / 1000).toFixed(1)}K</Text>
              </View>
            </View>
            <Text className="text-2xl font-bold text-txt-primary mb-2.5 leading-8">{market.title}</Text>
            {market.yesSubTitle && (
              <Text className="text-sm text-txt-secondary mb-2.5">
                <Text className="font-bold text-status-success">Yes</Text> = {market.yesSubTitle}
              </Text>
            )}
            {market.closeTime && (
              <View className="flex-row items-center gap-1.5">
                <Ionicons name="time-outline" size={14} color={Theme.textDisabled} />
                <Text className="text-[13px] text-txt-disabled">
                  Closes {new Date(market.closeTime * 1000).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            )}
          </View>

          {/* Probability Card */}
          <View className="bg-app-card rounded-2xl p-[18px] mb-4 border border-border">
            <View className="flex-row justify-between items-center mb-3.5">
              <Text className="text-txt-secondary text-[13px] font-semibold">Current Probability</Text>
              <Text className="text-[28px] font-bold" style={{ color: Theme.accentSubtle }}>{estimatedProbability.toFixed(1)}%</Text>
            </View>
            <View className="mb-2">
              <View className="h-1.5 bg-red-400/25 rounded-full overflow-hidden">
                <View className="h-full bg-status-success rounded-full" style={{ width: `${estimatedProbability}%` }} />
              </View>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-status-success text-[11px] font-bold">Yes</Text>
              <Text className="text-status-error text-[11px] font-bold">No</Text>
            </View>
          </View>

          {/* Trading Card */}
          <View className="bg-app-card rounded-[20px] p-5 mb-4 border border-border">
            {/* Side Selector */}
            <View className="flex-row gap-2.5 mb-5">
              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-between py-3.5 px-4 rounded-[14px] border-2 ${selectedSide === 'yes' ? 'bg-[#39FF14]/10 border-[#39FF14]/40' : 'bg-app-elevated border-transparent'
                  }`}
                onPress={() => { setSelectedSide('yes'); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center gap-2.5">
                  <Ionicons name="trending-up" size={20} color={selectedSide === 'yes' ? Theme.success : Theme.textDisabled} />
                  <Text className={`text-base font-bold ${selectedSide === 'yes' ? 'text-status-success' : 'text-txt-disabled'}`}>Yes</Text>
                </View>
                {selectedSide === 'yes' && (
                  <View className="w-[22px] h-[22px] rounded-full bg-white/10 justify-center items-center">
                    <Ionicons name="checkmark" size={14} color={Theme.success} />
                  </View>
                )}
              </TouchableOpacity>

              <TouchableOpacity
                className={`flex-1 flex-row items-center justify-between py-3.5 px-4 rounded-[14px] border-2 ${selectedSide === 'no' ? 'bg-[#FF10F0]/10 border-[#FF10F0]/40' : 'bg-app-elevated border-transparent'
                  }`}
                onPress={() => { setSelectedSide('no'); Haptics.selectionAsync(); }}
                activeOpacity={0.8}
              >
                <View className="flex-row items-center gap-2.5">
                  <Ionicons name="trending-down" size={20} color={selectedSide === 'no' ? Theme.error : Theme.textDisabled} />
                  <Text className={`text-base font-bold ${selectedSide === 'no' ? 'text-status-error' : 'text-txt-disabled'}`}>No</Text>
                </View>
                {selectedSide === 'no' && (
                  <View className="w-[22px] h-[22px] rounded-full bg-white/10 justify-center items-center">
                    <Ionicons name="checkmark" size={14} color={Theme.error} />
                  </View>
                )}
              </TouchableOpacity>
            </View>

            {/* Amount Input */}
            <View className="mb-4">
              <Text className="text-txt-secondary text-xs font-bold uppercase tracking-wide mb-2.5">Amount</Text>
              <View className="flex-row items-center bg-app-elevated rounded-[14px] border border-border px-4">
                <Text className="text-txt-secondary text-2xl font-semibold">$</Text>
                <Pressable className="flex-1" onPress={() => setAmountKeypadOpen(true)}>
                  <Text className="text-txt-primary text-[28px] font-bold py-3.5 pl-1.5">
                    {amount || "0"}
                  </Text>
                </Pressable>
              </View>
              <View className="flex-row gap-2 mt-3">
                {['5', '10', '25', '50', '100'].map((value) => (
                  <TouchableOpacity
                    key={value}
                    className={`flex-1 py-2.5 rounded-[10px] border items-center ${amount === value ? 'bg-cyan-500/10 border-cyan-500/30' : 'bg-app-elevated border-border'
                      }`}
                    onPress={() => { setAmount(value); Haptics.selectionAsync(); }}
                  >
                    <Text className={`text-[13px] font-semibold ${amount === value ? '' : 'text-txt-secondary'}`} style={amount === value ? { color: Theme.accentSubtle } : {}}>
                      ${value}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Payout Preview */}
            {betAmount > 0 && (
              <View className="bg-cyan-500/10 rounded-xl p-3.5 mb-4 border border-cyan-500/15">
                <View className="flex-row justify-between mb-1.5">
                  <Text className="text-txt-secondary text-[13px]">If you win</Text>
                  <Text className="text-txt-primary text-sm font-bold">${(betAmount * (100 / estimatedProbability)).toFixed(2)}</Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-txt-secondary text-[13px]">Profit</Text>
                  <Text className="text-status-success text-sm font-bold">+${((betAmount * (100 / estimatedProbability)) - betAmount).toFixed(2)}</Text>
                </View>
              </View>
            )}

            {/* Error Banner */}
            {tradeError && (
              <View className="flex-row items-center gap-2 bg-red-400/10 rounded-[10px] p-3 mb-4 border border-red-400/20">
                <Ionicons name="alert-circle" size={18} color={Theme.error} />
                <Text className="text-status-error text-[13px] font-medium flex-1">{tradeError}</Text>
              </View>
            )}

            {/* Trade Button */}
            <TouchableOpacity
              className={`rounded-[14px] overflow-hidden ${!canTrade ? 'opacity-70' : ''}`}
              onPress={handleTrade}
              disabled={!canTrade}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={canTrade ? [Theme.accentSubtle, '#00B8D4'] : [Theme.bgElevated, Theme.bgElevated]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 16 }}
              >
                {isTrading ? (
                  <ActivityIndicator size="small" color={Theme.bgMain} />
                ) : (
                  <>
                    <Text className={`text-base font-bold ${canTrade ? 'text-app-bg' : 'text-txt-disabled'}`}>
                      {betAmount > 0 ? `Bet $${betAmount.toFixed(2)} on ${selectedSide.toUpperCase()}` : 'Enter Amount'}
                    </Text>
                    {canTrade && <Ionicons name="arrow-forward" size={18} color={Theme.bgMain} />}
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Info Card */}
          <View className="bg-app-card rounded-2xl p-[18px] border border-border">
            <Text className="text-base font-bold text-txt-primary mb-3.5">Details</Text>
            <View className="flex-row flex-wrap gap-3 mb-3.5">
              <View className="bg-app-elevated rounded-[10px] p-3 min-w-[30%] flex-1">
                <Text className="text-txt-disabled text-[11px] font-semibold uppercase tracking-wide mb-1">Status</Text>
                <Text className="text-txt-primary text-sm font-semibold">{market.status}</Text>
              </View>
              <View className="bg-app-elevated rounded-[10px] p-3 min-w-[30%] flex-1">
                <Text className="text-txt-disabled text-[11px] font-semibold uppercase tracking-wide mb-1">Volume</Text>
                <Text className="text-txt-primary text-sm font-semibold">${((market.volume || 0) / 1000).toFixed(1)}K</Text>
              </View>
              {market.openInterest && (
                <View className="bg-app-elevated rounded-[10px] p-3 min-w-[30%] flex-1">
                  <Text className="text-txt-disabled text-[11px] font-semibold uppercase tracking-wide mb-1">Open Interest</Text>
                  <Text className="text-txt-primary text-sm font-semibold">${(market.openInterest / 1000).toFixed(1)}K</Text>
                </View>
              )}
            </View>
            {market.rulesPrimary && (
              <View className="pt-3.5 border-t border-border">
                <Text className="text-txt-secondary text-xs font-semibold mb-2">Rules</Text>
                <Text className="text-txt-primary text-[13px] leading-5">{market.rulesPrimary}</Text>
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>

      <TradeQuoteSheet
        visible={showQuoteSheet}
        onClose={() => setShowQuoteSheet(false)}
        onSubmit={handleQuoteSubmit}
        onSkip={handleQuoteSkip}
        tradeInfo={{ side: selectedSide, amount: amount, marketTitle: market.title }}
      />
      <CustomKeypad
        visible={amountKeypadOpen}
        value={amount}
        onChange={(next) => { setAmount(next.replace(',', '.')); setTradeError(null); }}
        onClose={() => setAmountKeypadOpen(false)}
        probability={market?.yesBid && market?.yesAsk ? ((parseFloat(market.yesBid) + parseFloat(market.yesAsk)) / 2 * 100) : undefined}
        selectedSide={selectedSide}
      />
    </View>
  );
}
