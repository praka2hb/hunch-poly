import { useUser } from "@/contexts/UserContext";
import { api } from "@/lib/api";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Keyboard,
    KeyboardAvoidingView,
    Platform,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;
const { width } = Dimensions.get("window");

export default function UsernameScreen() {
    const router = useRouter();
    const params = useLocalSearchParams<{ suggested?: string }>();
    const { backendUser, setBackendUser } = useUser();
    const [username, setUsername] = useState("");
    const [isChecking, setIsChecking] = useState(false);
    const [isClaiming, setIsClaiming] = useState(false);
    const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
    const [helperText, setHelperText] = useState("3-20 chars · lowercase · numbers · underscore");
    const [error, setError] = useState("");
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef<TextInput>(null);

    // Animations
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(30)).current;
    const cardScale = useRef(new Animated.Value(0.95)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const previewOpacity = useRef(new Animated.Value(0)).current;
    const previewScale = useRef(new Animated.Value(0.8)).current;
    const buttonSlide = useRef(new Animated.Value(60)).current;
    const borderColor = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    // Entry animations
    useEffect(() => {
        Animated.stagger(120, [
            Animated.parallel([
                Animated.timing(headerOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.spring(headerSlide, { toValue: 0, useNativeDriver: true, tension: 60, friction: 10 }),
            ]),
            Animated.parallel([
                Animated.spring(cardScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
                Animated.timing(cardOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            ]),
            Animated.spring(buttonSlide, { toValue: 0, useNativeDriver: true, tension: 50, friction: 10 }),
        ]).start(() => {
            // Auto-focus the input after animations
            setTimeout(() => inputRef.current?.focus(), 200);
        });
    }, []);

    // Pulse animation for the status dot when checking
    useEffect(() => {
        if (isChecking) {
            const pulse = Animated.loop(
                Animated.sequence([
                    Animated.timing(pulseAnim, { toValue: 1.4, duration: 600, useNativeDriver: true }),
                    Animated.timing(pulseAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
                ])
            );
            pulse.start();
            return () => pulse.stop();
        } else {
            pulseAnim.setValue(1);
        }
    }, [isChecking]);

    // Animate border color based on state
    useEffect(() => {
        Animated.timing(borderColor, {
            toValue: isAvailable === true ? 1 : isAvailable === false ? 2 : isFocused ? 0.5 : 0,
            duration: 250,
            useNativeDriver: false,
        }).start();
    }, [isAvailable, isFocused]);

    // Animate preview card
    useEffect(() => {
        if (username.length >= 3 && isAvailable === true) {
            Animated.parallel([
                Animated.spring(previewScale, { toValue: 1, useNativeDriver: true, tension: 60, friction: 8 }),
                Animated.timing(previewOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.spring(previewScale, { toValue: 0.8, useNativeDriver: true, tension: 60, friction: 8 }),
                Animated.timing(previewOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
            ]).start();
        }
    }, [username, isAvailable]);

    // Removed auto-fill from X username suggestion
    // useEffect(() => {
    //     const suggested = typeof params.suggested === "string" ? params.suggested : "";
    //     if (!suggested || username) return;
    //     setUsername(suggested.replace(/\s/g, "").replace(/^@+/, "").toLowerCase());
    // }, [params.suggested, username]);

    useEffect(() => {
        const trimmed = username.trim().toLowerCase();
        if (!trimmed) {
            setIsAvailable(null);
            setHelperText("3-20 chars · lowercase · numbers · underscore");
            return;
        }

        if (!USERNAME_REGEX.test(trimmed)) {
            setIsAvailable(false);
            setHelperText("Use 3-20 chars: a-z, 0-9, and _");
            return;
        }

        setIsChecking(true);
        const timeoutId = setTimeout(async () => {
            try {
                const result = await api.checkUsernameAvailability(trimmed);
                setIsAvailable(result.available);
                setHelperText(
                    result.available
                        ? "You're all set! This one's yours."
                        : result.reason || "Already taken — try another"
                );
                if (result.available) {
                    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                }
            } catch (availabilityError) {
                console.error("[Username] Availability check failed:", availabilityError);
                setIsAvailable(false);
                setHelperText("Could not verify right now. Please retry.");
            } finally {
                setIsChecking(false);
            }
        }, 350);

        return () => {
            clearTimeout(timeoutId);
        };
    }, [username]);

    const normalizedUsername = useMemo(() => username.trim().toLowerCase(), [username]);
    const canContinue = !!normalizedUsername && isAvailable === true && !isChecking && !isClaiming;

    const handleContinue = async () => {
        if (!canContinue) return;

        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        Keyboard.dismiss();
        setIsClaiming(true);
        setError("");

        try {
            const updatedUser = await api.claimUsername(normalizedUsername);

            // Also use the username as displayName if current displayName is missing or looks random
            const currentDisplayName = updatedUser.displayName || backendUser?.displayName;
            const needsDisplayNameUpdate = !currentDisplayName
                || /^[a-z0-9]{8,}$/i.test(currentDisplayName.trim())
                || currentDisplayName.includes("privaterelay");

            let finalUser = updatedUser;
            if (needsDisplayNameUpdate && updatedUser.walletAddress) {
                try {
                    finalUser = await api.syncUser({
                        privyId: updatedUser.privyId,
                        walletAddress: updatedUser.walletAddress,
                        displayName: normalizedUsername,
                    });
                } catch (syncError) {
                    console.warn("[Username] Display name sync failed, continuing:", syncError);
                }
            }

            const merged = {
                ...(backendUser || finalUser),
                ...finalUser,
                username: normalizedUsername,
                displayName: needsDisplayNameUpdate ? normalizedUsername : (finalUser.displayName || normalizedUsername),
                onboardingStep: 'INTERESTS' as const,
            };
            await setBackendUser(merged);
            await api.saveOnboardingProgress({ step: "INTERESTS" });
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.replace("/preferences");
        } catch (claimError: any) {
            console.error("[Username] Claim failed:", claimError);
            setError(claimError?.message || "Failed to claim username");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsClaiming(false);
        }
    };

    const interpolatedBorderColor = borderColor.interpolate({
        inputRange: [0, 0.5, 1, 2],
        outputRange: ["#E5E7EB", "#000000", "#22C55E", "#EF4444"],
    });

    const statusDotColor = isAvailable === true ? "#22C55E" : isAvailable === false ? "#EF4444" : "#9CA3AF";

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                <KeyboardAvoidingView
                    style={styles.keyboardView}
                    behavior={Platform.OS === "ios" ? "padding" : "height"}
                    keyboardVerticalOffset={10}
                >
                    {/* Top Spacer for vertical centering */}
                    <View style={{ flex: 0.5 }} />

                    {/* Header */}
                    <Animated.View
                        style={[
                            styles.headerContainer,
                            { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
                        ]}
                    >
                        <Text style={styles.title}>claim your @</Text>
                        <Text style={styles.subtitle}>
                            Your identity on Hunch. Make it memorable.
                        </Text>
                    </Animated.View>

                    {/* Input Card */}
                    <Animated.View
                        style={[
                            styles.inputCard,
                            {
                                opacity: cardOpacity,
                                transform: [{ scale: cardScale }],
                            },
                        ]}
                    >
                        <Animated.View
                            style={[
                                styles.inputWrapper,
                                { borderColor: interpolatedBorderColor },
                            ]}
                        >
                            <View style={styles.atSymbolContainer}>
                                <Text style={styles.atSymbol}>@</Text>
                            </View>
                            <TextInput
                                ref={inputRef}
                                value={username}
                                onChangeText={(value) => {
                                    setError("");
                                    setUsername(value.replace(/\s/g, "").toLowerCase());
                                }}
                                onFocus={() => setIsFocused(true)}
                                onBlur={() => setIsFocused(false)}
                                autoCapitalize="none"
                                autoCorrect={false}
                                autoComplete="off"
                                placeholder="your_name"
                                placeholderTextColor="#D1D5DB"
                                style={styles.textInput}
                                maxLength={20}
                                returnKeyType="done"
                                onSubmitEditing={handleContinue}
                            />
                            {/* Status indicator */}
                            <View style={styles.statusContainer}>
                                {isChecking ? (
                                    <Animated.View
                                        style={[
                                            styles.statusDot,
                                            {
                                                backgroundColor: "#FCD34D",
                                                transform: [{ scale: pulseAnim }],
                                            },
                                        ]}
                                    />
                                ) : username.length > 0 ? (
                                    <View style={[styles.statusDot, { backgroundColor: statusDotColor }]}>
                                        {isAvailable === true && (
                                            <Ionicons name="checkmark" size={10} color="#fff" />
                                        )}
                                        {isAvailable === false && (
                                            <Ionicons name="close" size={10} color="#fff" />
                                        )}
                                    </View>
                                ) : null}
                            </View>
                        </Animated.View>

                        {/* Helper text */}
                        <View style={styles.helperRow}>
                            <Text
                                style={[
                                    styles.helperText,
                                    isAvailable === true && styles.helperSuccess,
                                    isAvailable === false && styles.helperError,
                                ]}
                            >
                                {helperText}
                            </Text>
                            {username.length > 0 && (
                                <Text style={styles.charCount}>
                                    {username.length}/20
                                </Text>
                            )}
                        </View>

                        {error ? (
                            <View style={styles.errorBanner}>
                                <Ionicons name="warning" size={14} color="#DC2626" />
                                <Text style={styles.errorText}>{error}</Text>
                            </View>
                        ) : null}
                    </Animated.View>

                    {/* Live Profile Preview */}
                    <Animated.View
                        style={[
                            styles.previewCard,
                            {
                                opacity: previewOpacity,
                                transform: [{ scale: previewScale }],
                            },
                        ]}
                    >
                        <Text style={styles.previewLabel}>preview</Text>
                        <View style={styles.previewContent}>
                            <View style={styles.previewAvatar}>
                                <Text style={styles.previewAvatarText}>
                                    {normalizedUsername ? normalizedUsername[0].toUpperCase() : "?"}
                                </Text>
                            </View>
                            <View style={styles.previewInfo}>
                                <Text style={styles.previewDisplayName} numberOfLines={1}>
                                    {normalizedUsername}
                                </Text>
                                <Text style={styles.previewHandle} numberOfLines={1}>
                                    @{normalizedUsername}
                                </Text>
                            </View>
                            <View style={styles.previewFollowBtn}>
                                <Text style={styles.previewFollowText}>Follow</Text>
                            </View>
                        </View>
                    </Animated.View>

                    {/* Bottom Spacer for vertical centering */}
                    <View style={{ flex: 1 }} />

                    {/* Continue Button */}
                    <Animated.View
                        style={[
                            styles.buttonContainer,
                            { transform: [{ translateY: buttonSlide }] },
                        ]}
                    >
                        <TouchableOpacity
                            onPress={handleContinue}
                            disabled={!canContinue}
                            activeOpacity={0.85}
                            style={[
                                styles.continueButton,
                                canContinue ? styles.continueButtonActive : styles.continueButtonDisabled,
                            ]}
                        >
                            {isClaiming ? (
                                <ActivityIndicator size="small" color={canContinue ? "#000" : "#9CA3AF"} />
                            ) : (
                                <View style={styles.buttonInner}>
                                    <Text
                                        style={[
                                            styles.continueText,
                                            canContinue ? styles.continueTextActive : styles.continueTextDisabled,
                                        ]}
                                    >
                                        Claim @{normalizedUsername || "username"}
                                    </Text>
                                    <View
                                        style={[
                                            styles.arrowCircle,
                                            { backgroundColor: canContinue ? "#000" : "#D1D5DB" },
                                        ]}
                                    >
                                        <Ionicons
                                            name="arrow-forward"
                                            size={16}
                                            color="#fff"
                                        />
                                    </View>
                                </View>
                            )}
                        </TouchableOpacity>
                    </Animated.View>
                </KeyboardAvoidingView>
            </SafeAreaView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: "#FAFAFA",
    },
    safeArea: {
        flex: 1,
    },
    keyboardView: {
        flex: 1,
        paddingHorizontal: 24,
    },
    headerContainer: {
        marginBottom: 40,
    },
    title: {
        fontSize: 34,
        fontWeight: "900",
        color: "#000",
        letterSpacing: -1,
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 16,
        color: "#6B7280",
        lineHeight: 22,
    },
    inputCard: {
        marginBottom: 16,
    },
    inputWrapper: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#fff",
        borderRadius: 20,
        borderWidth: 2,
        borderColor: "#E5E7EB",
        paddingHorizontal: 4,
        paddingVertical: 4,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    atSymbolContainer: {
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        justifyContent: "center",
        marginRight: 4,
    },
    atSymbol: {
        fontSize: 20,
        fontWeight: "800",
        color: "#374151",
    },
    textInput: {
        flex: 1,
        fontSize: 18,
        fontWeight: "600",
        color: "#111827",
        paddingVertical: Platform.OS === "ios" ? 12 : 8,
        letterSpacing: 0.3,
    },
    statusContainer: {
        width: 36,
        height: 36,
        alignItems: "center",
        justifyContent: "center",
    },
    statusDot: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: "center",
        justifyContent: "center",
    },
    helperRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        paddingHorizontal: 8,
        marginTop: 10,
    },
    helperText: {
        fontSize: 13,
        color: "#9CA3AF",
        fontWeight: "500",
        flex: 1,
    },
    helperSuccess: {
        color: "#16A34A",
    },
    helperError: {
        color: "#DC2626",
    },
    charCount: {
        fontSize: 12,
        color: "#D1D5DB",
        fontWeight: "600",
        marginLeft: 8,
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        marginTop: 12,
        gap: 8,
    },
    errorText: {
        color: "#DC2626",
        fontSize: 13,
        fontWeight: "500",
        flex: 1,
    },
    previewCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        padding: 16,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
    },
    previewLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: "#D1D5DB",
        textTransform: "uppercase",
        letterSpacing: 1.5,
        marginBottom: 12,
    },
    previewContent: {
        flexDirection: "row",
        alignItems: "center",
    },
    previewAvatar: {
        width: 48,
        height: 48,
        borderRadius: 16,
        backgroundColor: "#FEEC28",
        alignItems: "center",
        justifyContent: "center",
    },
    previewAvatarText: {
        fontSize: 20,
        fontWeight: "900",
        color: "#000",
    },
    previewInfo: {
        flex: 1,
        marginLeft: 12,
    },
    previewDisplayName: {
        fontSize: 16,
        fontWeight: "700",
        color: "#111827",
    },
    previewHandle: {
        fontSize: 14,
        color: "#9CA3AF",
        marginTop: 1,
    },
    previewFollowBtn: {
        backgroundColor: "#000",
        paddingHorizontal: 18,
        paddingVertical: 8,
        borderRadius: 20,
    },
    previewFollowText: {
        color: "#fff",
        fontSize: 13,
        fontWeight: "700",
    },
    buttonContainer: {
        paddingBottom: 16,
        paddingTop: 12,
    },
    continueButton: {
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    continueButtonActive: {
        backgroundColor: "#FEEC28",
    },
    continueButtonDisabled: {
        backgroundColor: "#F3F4F6",
    },
    buttonInner: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    continueText: {
        fontSize: 17,
        fontWeight: "700",
    },
    continueTextActive: {
        color: "#000",
    },
    continueTextDisabled: {
        color: "#9CA3AF",
    },
    arrowCircle: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
    },
});
