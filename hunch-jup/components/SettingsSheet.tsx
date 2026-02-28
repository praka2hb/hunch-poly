import { Theme } from '@/constants/theme';
import { Ionicons } from "@expo/vector-icons";
import { BlurView } from "expo-blur";
import { useEffect, useRef } from "react";
import { Animated, Dimensions, Modal, PanResponder, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function SettingsSheet({
    visible,
    onClose,
    onSwitchTheme,
    onLogout,
}: {
    visible: boolean;
    onClose: () => void;
    onSwitchTheme: () => void;
    onLogout: () => void;
}) {
    const insets = useSafeAreaInsets();
    const halfScreenHeight = Math.round(Dimensions.get("window").height * 0.5);
    const slideAnim = useRef(new Animated.Value(halfScreenHeight)).current;
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
                if (gesture.dy > halfScreenHeight * 0.25) {
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
                toValue: halfScreenHeight,
                duration: 150,
                useNativeDriver: true,
            }).start();
        }
    }, [visible, halfScreenHeight]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={styles.backdrop} onPress={onClose}>
                <BlurView intensity={25} tint="default" style={StyleSheet.absoluteFill} />
                <View style={styles.backdropTint} />
                <Animated.View
                    style={[
                        styles.sheet,
                        {
                            height: halfScreenHeight,
                            paddingBottom: Math.max(insets.bottom, 20),
                            transform: [{ translateY: slideAnim }],
                        }
                    ]}
                >
                    <Pressable onPress={(e) => e.stopPropagation()}>
                        <View className="items-center py-2" {...panResponder.panHandlers}>
                            <View className="w-12 h-1.5 rounded-full bg-border" />
                        </View>
                        <View className="pb-4">
                            <Text className="text-3xl pt-4 px-3 font-bold text-txt-primary">Settings</Text>
                        </View>

                        <View className="gap-2 pb-2">
                            {/* Switch Theme */}
                            <TouchableOpacity
                                className="flex-row items-center justify-between py-4 px-1"
                                onPress={() => { onSwitchTheme(); onClose(); }}
                                activeOpacity={0.7}
                            >
                                <View className="flex-row items-center gap-3.5">
                                    <Ionicons name="moon-outline" size={22} color={Theme.textPrimary} />
                                    <Text className="text-base font-semibold text-txt-primary">Switch Theme</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Theme.textSecondary} />
                            </TouchableOpacity>

                            {/* Logout */}
                            <TouchableOpacity
                                className="flex-row items-center justify-between py-4 px-1"
                                onPress={() => { onLogout(); onClose(); }}
                                activeOpacity={0.7}
                            >
                                <View className="flex-row items-center gap-3.5">
                                    <Ionicons name="log-out-outline" size={22} color={Theme.error} />
                                    <Text className="text-base font-semibold text-status-error">Logout</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={Theme.error} />
                            </TouchableOpacity>
                        </View>
                    </Pressable>
                </Animated.View>
            </Pressable>
        </Modal>
    );
}

// Minimal styles for sheet positioning
const styles = StyleSheet.create({
    backdrop: {
        flex: 1,
        justifyContent: "flex-end",
    },
    backdropTint: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: "rgba(0, 0, 0, 0.25)",
    },
    sheet: {
        backgroundColor: Theme.bgMain,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderColor: Theme.border,
    },
});
