import { Theme } from '@/constants/theme';
import { AggregatedPosition } from '@/lib/types';
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from 'expo-blur';
import { LinearGradient } from "expo-linear-gradient";
import { useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Animated, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface SellPositionSheetProps {
    visible: boolean;
    onClose: () => void;
    onSell: () => Promise<void>;
    submitting?: boolean;
    position: AggregatedPosition | null;
}

export default function SellPositionSheet({
    visible,
    onClose,
    onSell,
    submitting = false,
    position,
}: SellPositionSheetProps) {
    const insets = useSafeAreaInsets();
    const [error, setError] = useState<string | null>(null);
    const slideAnim = useRef(new Animated.Value(400)).current;

    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dy) > 6,
            onPanResponderMove: (_, gesture) => {
                if (gesture.dy > 0) {
                    slideAnim.setValue(gesture.dy);
                }
            },
            onPanResponderRelease: (_, gesture) => {
                if (gesture.dy > 120) {
                    onClose();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 30,
                        stiffness: 500,
                        mass: 0.8,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (visible) {
            setError(null);
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 30,
                stiffness: 500,
                mass: 0.8,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: 400,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, slideAnim]);

    // Calculate tokens available to sell
    const tokensToSell = useMemo(() => {
        if (!position) return 0;
        // Use totalTokenAmount first (this is the actual available tokens), fallback to calculation
        const tokens = position.totalTokenAmount > 0 
            ? position.totalTokenAmount 
            : Math.max(0, position.totalTokensBought - position.totalTokensSold);
        console.log('[SellSheet] Tokens calculation:', {
            totalTokenAmount: position.totalTokenAmount,
            totalTokensBought: position.totalTokensBought,
            totalTokensSold: position.totalTokensSold,
            finalTokens: tokens,
        });
        return tokens;
    }, [position]);

    // Estimated value based on current price
    const estimatedValue = useMemo(() => {
        if (!position?.currentPrice || tokensToSell <= 0) return null;
        return tokensToSell * position.currentPrice;
    }, [position, tokensToSell]);

    const canSell = tokensToSell > 0 && !submitting && position;

    const handleSell = async () => {
        if (!canSell) return;
        setError(null);
        try {
            await onSell();
        } catch (err: any) {
            setError(err.message || 'Failed to sell position');
        }
    };

    if (!position) return null;

    const isYes = position.side === 'yes';
    const marketTitle = position.market?.title || position.marketTicker;

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable className="flex-1 justify-end" onPress={onClose} style={StyleSheet.absoluteFill}>
                <BlurView intensity={25} tint="default" style={StyleSheet.absoluteFill} />
                <View style={styles.backdropTint} />
                <KeyboardAvoidingView
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={Platform.OS === "ios" ? 16 : 0}
                    style={{ width: "100%" }}
                >
                    <Animated.View
                        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] }]}
                    >
                        <Pressable onPress={(e) => e.stopPropagation()}>
                            {/* Drag Handle */}
                            <View className="items-center py-2" {...panResponder.panHandlers}>
                                <View className="w-12 h-1.5 rounded-full bg-border" />
                            </View>

                            {/* Close Button */}
                            <TouchableOpacity
                                className="absolute right-4 top-3 w-9 h-9 rounded-xl bg-app-card border border-border justify-center items-center z-10"
                                onPress={onClose}
                                activeOpacity={0.7}
                            >
                                <Ionicons name="close" size={20} color={Theme.textSecondary} />
                            </TouchableOpacity>

                            {/* Header */}
                            <View className="pb-4">
                                <Text className="text-xl font-bold text-txt-primary">Sell All Tokens</Text>
                                <Text className="mt-1 text-sm text-txt-secondary" numberOfLines={2}>
                                    {marketTitle}
                                </Text>
                            </View>

                            {/* Position Summary */}
                            <View className="bg-app-card rounded-xl p-4 mb-4 border border-border">
                                <View className="flex-row items-center justify-between mb-3">
                                    <View className="flex-row items-center gap-2">
                                        <View className={`px-2 py-1 rounded-md ${isYes ? 'bg-[#2596be]/15' : 'bg-[#FF10F0]/15'}`}>
                                            <Text
                                                className={`text-xs font-bold ${isYes ? 'text-[#2596be]' : 'text-[#FF10F0]'}`}
                                                style={{ fontFamily: 'BBHSansHegarty' }}
                                            >
                                                {isYes ? 'YES' : 'NO'}
                                            </Text>
                                        </View>
                                        <Text className="text-sm text-txt-secondary">position</Text>
                                    </View>
                                    <Text className="text-sm font-medium text-txt-primary">
                                        {tokensToSell.toFixed(2)} tokens
                                    </Text>
                                </View>
                                <View className="flex-row justify-between">
                                    <View>
                                        <Text className="text-xs text-txt-disabled uppercase">Current Price</Text>
                                        <Text className="text-base font-semibold text-txt-primary">
                                            ${position.currentPrice?.toFixed(4) || '—'}
                                        </Text>
                                    </View>
                                    <View className="items-end">
                                        <Text className="text-xs text-txt-disabled uppercase">Est. Value</Text>
                                        <Text className="text-base font-semibold text-txt-primary">
                                            ${(tokensToSell * (position.currentPrice || 0)).toFixed(2)}
                                        </Text>
                                    </View>
                                </View>
                            </View>

                            {/* Estimated Return */}
                            {estimatedValue !== null && estimatedValue > 0 && (
                                <View className="bg-cyan-500/10 rounded-xl p-3.5 mb-4 border border-cyan-500/15">
                                    <View className="flex-row items-center justify-between">
                                        <Text className="text-txt-secondary text-sm">Estimated Return</Text>
                                        <Text className="text-txt-primary text-lg font-bold">
                                            ~${estimatedValue.toFixed(2)}
                                        </Text>
                                    </View>
                                </View>
                            )}

                            {/* Error Message */}
                            {error && (
                                <View className="bg-[#FF10F0]/10 rounded-xl p-3 mb-4 border border-[#FF10F0]/20">
                                    <Text className="text-[#FF10F0] text-sm text-center">{error}</Text>
                                </View>
                            )}

                            {/* Sell All Button */}
                            <TouchableOpacity
                                activeOpacity={0.85}
                                disabled={!canSell}
                                onPress={handleSell}
                                className={`mt-2 ${!canSell ? 'opacity-60' : ''}`}
                            >
                                <LinearGradient
                                    colors={canSell ? ['#FF10F0', '#FF1493'] : [Theme.bgElevated, Theme.bgElevated]}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={styles.ctaGrad}
                                >
                                    {submitting ? (
                                        <ActivityIndicator size="small" color="#fff" />
                                    ) : (
                                        <>
                                            <Ionicons name="trending-down" size={18} color="#fff" />
                                            <Text className="text-white text-base font-bold">
                                                Sell All {tokensToSell.toFixed(2)} Tokens
                                            </Text>
                                        </>
                                    )}
                                </LinearGradient>
                            </TouchableOpacity>
                        </Pressable>
                    </Animated.View>
                </KeyboardAvoidingView>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdropTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.35)',
    },
    sheet: {
        backgroundColor: Theme.bgCard,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 20,
        paddingTop: 8,
    shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 24,
    },
    ctaGrad: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        height: 56,
        borderRadius: 16,
    },
});
