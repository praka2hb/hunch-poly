/**
 * Trade detail screen - used for push notification deep links
 * When notification.data.type === "TRADE", we navigate here with tradeId
 */

import { api } from '@/lib/api';
import { Trade } from '@/lib/types';
import { Theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function TradeDetailScreen() {
  const { tradeId } = useLocalSearchParams<{ tradeId: string }>();
  const [trade, setTrade] = useState<Trade | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (tradeId) loadTrade();
  }, [tradeId]);

  const loadTrade = async () => {
    if (!tradeId) return;
    try {
      setLoading(true);
      setError(null);
      const data = await api.getTrade(tradeId);
      setTrade(data ?? null);
    } catch (err) {
      console.error('[Trade] Failed to load trade:', err);
      setError('Trade not found');
      setTrade(null);
    } finally {
      setLoading(false);
    }
  };

  const handleViewMarket = () => {
    if (trade?.marketTicker) {
      router.replace(`/market/${trade.marketTicker}` as any);
    } else {
      router.replace('/(tabs)');
    }
  };

  const handleGoHome = () => {
    router.replace('/(tabs)');
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Theme.textPrimary} />
          <Text style={styles.loadingText}>Loading trade...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error || !trade) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={handleGoHome}
          activeOpacity={0.8}
        >
          <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
        </TouchableOpacity>
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={Theme.textSecondary} />
          <Text style={styles.errorTitle}>Trade not found</Text>
          <Text style={styles.errorSubtitle}>
            This trade may have been removed or you don't have access to it.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={handleGoHome} activeOpacity={0.8}>
            <Text style={styles.primaryButtonText}>Go to Home</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const amount = Number(trade.amount);
  const sideLabel = trade.side === 'yes' ? 'YES' : 'NO';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.back()}
        activeOpacity={0.8}
      >
        <Ionicons name="arrow-back" size={24} color={Theme.textPrimary} />
      </TouchableOpacity>

      <View style={styles.content}>
        <View style={styles.tradeCard}>
          <View style={styles.tradeHeader}>
            <Text style={styles.sideBadge}>{sideLabel}</Text>
            <Text style={styles.amount}>${Number.isFinite(amount) ? amount.toFixed(2) : trade.amount}</Text>
          </View>
          <Text style={styles.marketTicker}>{trade.marketTicker}</Text>
        </View>

        <TouchableOpacity style={styles.primaryButton} onPress={handleViewMarket} activeOpacity={0.8}>
          <Ionicons name="open-outline" size={20} color="#FFF" />
          <Text style={styles.primaryButtonText}>View Market</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Theme.bgMain,
  },
  backButton: {
    position: 'absolute',
    top: 16,
    left: 16,
    zIndex: 10,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Theme.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: Theme.textSecondary,
  },
  errorTitle: {
    marginTop: 16,
    fontSize: 20,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  errorSubtitle: {
    marginTop: 8,
    fontSize: 15,
    color: Theme.textSecondary,
    textAlign: 'center',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 72,
  },
  tradeCard: {
    backgroundColor: Theme.bgCard,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: Theme.border,
  },
  tradeHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  sideBadge: {
    fontSize: 14,
    fontWeight: '700',
    color: Theme.textInverse,
    backgroundColor: Theme.textPrimary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  amount: {
    fontSize: 24,
    fontWeight: '700',
    color: Theme.textPrimary,
  },
  marketTicker: {
    fontSize: 15,
    color: Theme.textSecondary,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: Theme.accent,
    paddingVertical: 16,
    borderRadius: 14,
    marginTop: 24,
  },
  primaryButtonText: {
    color: Theme.textInverse,
    fontSize: 17,
    fontWeight: '700',
  },
});
