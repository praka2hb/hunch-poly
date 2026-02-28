import { Theme } from '@/constants/theme';
import { AggregatedPosition } from '@/lib/types';
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface PositionActionSheetProps {
    visible: boolean;
    onClose: () => void;
    position: AggregatedPosition | null;
    onViewMarket: (ticker: string) => void;
    onSell: (position: AggregatedPosition) => void;
}

export default function PositionActionSheet({
    visible,
    onClose,
    position,
    onViewMarket,
    onSell,
}: PositionActionSheetProps) {
    const insets = useSafeAreaInsets();
    const sheetHeight = Math.round(Dimensions.get("window").height * 0.35); // Shorter than settings
    const slideAnim = useRef(new Animated.Value(sheetHeight)).current;

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
                if (gesture.dy > sheetHeight * 0.25) {
                    onClose();
                } else {
                    Animated.spring(slideAnim, {
                        toValue: 0,
                        useNativeDriver: true,
                        damping: 25,
                        stiffness: 400,
                    }).start();
                }
            },
        })
    ).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 25,
                stiffness: 400,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: sheetHeight,
                duration: 150,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, sheetHeight]);

    if (!position) return null;

    const isYes = position.side === 'yes';
    const marketTitle = position.market?.title || position.marketTicker;
    const hasTokens = position.totalTokenAmount > 0.001 || (position.totalTokensBought - position.totalTokensSold) > 0.001;
    const canSell = hasTokens && position.positionStatus !== 'CLOSED'; // Basic check, parent handles exact logic

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={20} tint="default" style={StyleSheet.absoluteFill} />
                <View style={styles.backdropTint} />
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            height: sheetHeight,
                            paddingBottom: Math.max(insets.bottom, 20),
                            transform: [{ translateY: slideAnim }],
                        }
                    ]}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View className="items-center py-2" {...panResponder.panHandlers}>
                            <View className="w-12 h-1.5 rounded-full bg-border" />
                        </View>

                        {/* Header */}
                        <View className="pb-4 px-1">
                            <Text className="text-xl font-bold text-txt-primary" numberOfLines={1}>
                                {marketTitle}
                            </Text>
                            <View className="flex-row items-center gap-2 mt-1">
                                <View className={`px-2 py-0.5 rounded-md ${isYes ? 'bg-[#2596be]/10' : 'bg-[#FF10F0]/10'}`}>
                                    <Text
                                        className={`text-xs font-bold ${isYes ? 'text-[#2596be]' : 'text-[#FF10F0]'}`}
                                        style={{ fontFamily: 'BBHSansHegarty' }}
                                    >
                                        {isYes ? 'YES' : 'NO'}
                                    </Text>
                                </View>
                                <Text className="text-sm text-txt-secondary">Position Options</Text>
                            </View>
                        </View>

                        <View className="gap-2">
                            {/* View Market */}
                            <TouchableOpacity
                                className="flex-row items-center justify-between py-3.5 px-2 bg-app-card rounded-xl border border-border mb-2"
                                onPress={() => { onViewMarket(position.marketTicker); onClose(); }}
                                activeOpacity={0.7}
                            >
                                <View className="flex-row items-center gap-3.5">
                                    <View className="w-8 h-8 rounded-full bg-app-bg justify-center items-center">
                                        <Ionicons name="stats-chart" size={18} color={Theme.textPrimary} />
                                    </View>
                                    <Text className="text-base font-semibold text-txt-primary">View Market</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Theme.textSecondary} />
                            </TouchableOpacity>

                            {/* Sell Position */}
                            {canSell && (
                                <TouchableOpacity
                                    className="flex-row items-center justify-between py-3.5 px-2 bg-[#FF10F0]/5 rounded-xl border border-[#FF10F0]/10"
                                    onPress={() => { onSell(position); onClose(); }}
                                    activeOpacity={0.7}
                                >
                                    <View className="flex-row items-center gap-3.5">
                                        <View className="w-8 h-8 rounded-full bg-[#FF10F0]/10 justify-center items-center">
                                            <Ionicons name="trending-down" size={18} color="#FF10F0" />
                                        </View>
                                        <Text className="text-base font-semibold text-[#FF10F0]">Sell Position</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={20} color="#FF10F0" />
                                </TouchableOpacity>
                            )}
                        </View>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
    },
    backdropTint: {
        ...StyleSheet.absoluteFillObject, // Ensure typical styling pattern is followed
        position: 'absolute',    // Explicitly confirm absolute positioning
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(0, 0, 0, 0.4)",
    },
    sheet: {
        backgroundColor: Theme.bgMain,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 8,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
        elevation: 24,
    },
});
