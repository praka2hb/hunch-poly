import { Theme } from '@/constants/theme';
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from 'expo-blur';
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface TradeQuoteSheetProps {
    visible: boolean;
    onClose: () => void;
    onSubmit: (quote: string) => Promise<void> | void;
    onSkip: () => void;
    submitting?: boolean;
    tradeInfo: {
        side: 'yes' | 'no';
        amount: string;
        marketTitle: string;
    };
}

export default function TradeQuoteSheet({
    visible,
    onClose,
    onSubmit,
    onSkip,
    submitting = false,
    tradeInfo,
}: TradeQuoteSheetProps) {
    const insets = useSafeAreaInsets();
    const [quote, setQuote] = useState("");

    const handleSubmit = async () => {
        if (quote.trim()) await onSubmit(quote.trim());
    };

    const isYes = tradeInfo.side === 'yes';

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable className="flex-1 justify-center items-center p-5" onPress={onClose} style={StyleSheet.absoluteFill}>
                <BlurView intensity={30} tint="dark" style={StyleSheet.absoluteFill} />
                <View style={styles.backdropTint} />
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={styles.kav}>
                    <Pressable
                        style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 24) }]}
                        onPress={(e) => e.stopPropagation()}
                    >
                        {/* Order placed heading */}
                        <Text className="text-lg font-semibold text-txt-secondary mb-2">Order placed</Text>

                        {/* Success Icon */}
                        <View className="items-center mb-6 relative">
                            <View className={`absolute w-[100px] h-[100px] rounded-full opacity-30 ${isYes ? 'bg-[#00e003]' : 'bg-[#FF10F0]'}`} />
                            <LinearGradient
                                colors={isYes ? ['#00FF88', '#00CC6E'] : ['#FF3B5C', '#CC2E49']}
                                className="w-20 h-20 rounded-full justify-center items-center"
                            >
                                <Ionicons name="checkmark-sharp" size={40} color="#000000" />
                            </LinearGradient>
                        </View>

                        {/* Order details */}
                        <View className="items-center mb-6">
                            <Text className="text-5xl font-extrabold text-txt-primary tracking-tight mb-3">
                                ${tradeInfo.amount}
                            </Text>
                            <View className="flex-row items-center gap-2 mb-2">
                                <Text className="text-base text-txt-secondary font-medium">on</Text>
                                <View className={`px-4 py-1.5 rounded-full ${isYes ? 'bg-[#00e003]/15' : 'bg-[#FF10F0]/15'}`}>
                                    <Text className="text-[15px] font-bold text-txt-primary tracking-wide">
                                        {tradeInfo.side.toUpperCase()}
                                    </Text>
                                </View>
                            </View>
                            {tradeInfo.marketTitle && tradeInfo.marketTitle !== 'Market' && (
                                <Text className="text-sm text-txt-secondary text-center px-2" numberOfLines={2}>
                                    {tradeInfo.marketTitle}
                                </Text>
                            )}
                        </View>

                        {/* Quote Input */}
                        <View className="mb-6">
                            <TextInput
                                className="bg-white/5 rounded-[20px] border border-white/10 p-[18px] min-h-[120px] text-txt-primary text-base leading-6"
                                placeholder="Share your reasoning... (optional)"
                                placeholderTextColor={Theme.textDisabled}
                                value={quote}
                                onChangeText={setQuote}
                                multiline
                                maxLength={280}
                                textAlignVertical="top"
                                autoFocus
                            />
                            {quote.length > 0 && (
                                <Text className="text-xs text-txt-disabled text-right mt-2 font-medium">{quote.length}/280</Text>
                            )}
                        </View>

                        {/* Actions */}
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                className="flex-1 h-14 justify-center items-center bg-white/5 rounded-2xl border border-white/10"
                                onPress={onSkip}
                                disabled={submitting}
                            >
                                <Text className="text-base font-semibold text-txt-secondary">Skip</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                className={`flex-1 h-14 flex-row justify-center items-center gap-2 rounded-2xl ${quote.trim() ? 'bg-txt-primary' : 'bg-white/10'}`}
                                onPress={handleSubmit}
                                disabled={!quote.trim() || submitting}
                            >
                                {submitting ? (
                                    <ActivityIndicator size="small" color={Theme.textPrimary} />
                                ) : (
                                    <>
                                        <Ionicons name="arrow-forward" size={20} color={quote.trim() ? Theme.bgMain : Theme.textDisabled} />
                                        <Text className={`text-base font-bold ${quote.trim() ? 'text-app-bg' : 'text-txt-disabled'}`}>
                                            Post
                                        </Text>
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </KeyboardAvoidingView>
            </Pressable>
        </Modal>
    );
}

// Minimal styles for sheet and gradient sizing
const styles = StyleSheet.create({
    backdropTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
    },
    kav: {
        width: "100%",
        maxWidth: 440,
    },
    sheet: {
        backgroundColor: Theme.bgMain,
        borderRadius: 32,
        paddingHorizontal: 28,
        paddingTop: 40,
        borderWidth: 1,
        borderColor: "rgba(255,255,255,0.08)",
    },
});
