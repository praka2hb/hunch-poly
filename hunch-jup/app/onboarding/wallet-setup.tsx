import { useUser } from "@/contexts/UserContext";
import { api } from "@/lib/api";
import {
    buildApprovalTransactions,
    deriveOrCreateApiKey,
    getRelayClient,
} from "@/lib/polymarketClient";
import { Ionicons } from "@expo/vector-icons";
import { useEmbeddedEthereumWallet } from "@privy-io/expo";
import { ethers } from "ethers";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

const { width } = Dimensions.get("window");

type SetupStep = 1 | 2 | 3 | 4;

interface StepConfig {
    title: string;
    subtitle: string;
    icon: keyof typeof Ionicons.glyphMap;
    action: string;
}

const STEP_CONFIGS: Record<SetupStep, StepConfig> = {
    1: {
        title: "Derive Trading Wallet",
        subtitle: "Creating your secure Polymarket Safe address...",
        icon: "wallet-outline",
        action: "Setting up...",
    },
    2: {
        title: "Deploy Trading Wallet",
        subtitle: "Deploying your Safe contract on Polygon. This sends a transaction.",
        icon: "rocket-outline",
        action: "Deploy Wallet",
    },
    3: {
        title: "Set Token Approvals",
        subtitle: "Approving USDC and outcome tokens for trading. One batch transaction.",
        icon: "shield-checkmark-outline",
        action: "Approve Tokens",
    },
    4: {
        title: "Create API Credentials",
        subtitle: "Generating your Polymarket API keys for order placement.",
        icon: "key-outline",
        action: "Create Credentials",
    },
};

export default function WalletSetupScreen() {
    const router = useRouter();
    const { backendUser, setBackendUser } = useUser();
    const { wallets } = useEmbeddedEthereumWallet();

    const [currentStep, setCurrentStep] = useState<SetupStep>(1);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [safeAddress, setSafeAddress] = useState<string | null>(null);
    const [completedSteps, setCompletedSteps] = useState<Set<SetupStep>>(new Set());

    // Animations
    const headerOpacity = useRef(new Animated.Value(0)).current;
    const headerSlide = useRef(new Animated.Value(30)).current;
    const cardOpacity = useRef(new Animated.Value(0)).current;
    const cardScale = useRef(new Animated.Value(0.95)).current;
    const buttonSlide = useRef(new Animated.Value(60)).current;

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
        ]).start();
    }, []);

    // Resume from existing progress
    useEffect(() => {
        const checkStatus = async () => {
            try {
                const status = await api.getPolymarketOnboardingStatus();
                if (status.step >= 1 && status.safeAddress) {
                    setSafeAddress(status.safeAddress);
                    setCompletedSteps((prev) => new Set([...prev, 1]));
                }
                if (status.step >= 2) {
                    setCompletedSteps((prev) => new Set([...prev, 1, 2]));
                }
                if (status.step >= 3) {
                    setCompletedSteps((prev) => new Set([...prev, 1, 2, 3]));
                }
                if (status.step >= 4) {
                    // Already complete — go back
                    router.back();
                    return;
                }
                // Set current step to the next incomplete step
                const nextStep = Math.min(status.step + 1, 4) as SetupStep;
                setCurrentStep(nextStep);
            } catch (err) {
                console.log("[WalletSetup] Could not fetch status, starting from step 1");
            }
        };
        checkStatus();
    }, []);

    const getPrivySigner = useCallback(async (): Promise<ethers.providers.JsonRpcSigner> => {
        const wallet = wallets?.[0];
        if (!wallet) throw new Error("No embedded wallet found");

        const provider = await wallet.getProvider();
        // Switch to Polygon
        await provider.request({
            method: "wallet_switchEthereumChain",
            params: [{ chainId: "0x89" }], // 137 in hex
        });

        const ethersProvider = new ethers.providers.Web3Provider(provider);
        return ethersProvider.getSigner();
    }, [wallets]);

    // ─── Step 1: Derive Safe ───────────────────────────────────────────

    const executeStep1 = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const result = await api.deriveSafe();
            setSafeAddress(result.safeAddress);
            setCompletedSteps((prev) => new Set([...prev, 1]));

            // Update local user
            if (backendUser) {
                await setBackendUser({
                    ...backendUser,
                    safeAddress: result.safeAddress,
                    polymarketOnboardingStep: 1,
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCurrentStep(2);
        } catch (err: any) {
            console.error("[WalletSetup] Step 1 failed:", err);
            setError(err?.message || "Failed to derive trading wallet");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
        }
    }, [backendUser, setBackendUser]);

    // ─── Step 2: Deploy Safe ───────────────────────────────────────────

    const executeStep2 = useCallback(async () => {
        if (!safeAddress) {
            setError("Safe address not found. Please retry step 1.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const signer = await getPrivySigner();
            const relayClient = await getRelayClient(signer, safeAddress);

            // Deploy the Safe via the relay
            const deployResult = await relayClient.deploy();
            const txHash = deployResult.transactionHash || deployResult.hash || '';

            // Confirm with backend
            await api.confirmSafeDeployed(txHash);
            setCompletedSteps((prev) => new Set([...prev, 2]));

            if (backendUser) {
                await setBackendUser({
                    ...backendUser,
                    safeAddress,
                    safeDeployed: true,
                    polymarketOnboardingStep: 2,
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCurrentStep(3);
        } catch (err: any) {
            console.error("[WalletSetup] Step 2 failed:", err);
            setError(err?.message || "Failed to deploy trading wallet");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
        }
    }, [safeAddress, backendUser, setBackendUser, getPrivySigner]);

    // ─── Step 3: Set Approvals ─────────────────────────────────────────

    const executeStep3 = useCallback(async () => {
        if (!safeAddress) {
            setError("Safe address not found. Please retry step 1.");
            return;
        }

        setIsLoading(true);
        setError(null);
        try {
            const signer = await getPrivySigner();
            const relayClient = await getRelayClient(signer, safeAddress);
            const approvalTxs = buildApprovalTransactions();

            // Send all approval transactions via the relay (execute handles batching)
            const executeResult = await relayClient.execute(approvalTxs);
            const txHash = executeResult.transactionHash || executeResult.hash || '';

            // Confirm with backend
            await api.confirmApprovalsSet(txHash);
            setCompletedSteps((prev) => new Set([...prev, 3]));

            if (backendUser) {
                await setBackendUser({
                    ...backendUser,
                    safeAddress,
                    safeDeployed: true,
                    approvalsSet: true,
                    polymarketOnboardingStep: 3,
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            setCurrentStep(4);
        } catch (err: any) {
            console.error("[WalletSetup] Step 3 failed:", err);
            setError(err?.message || "Failed to set token approvals");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
        }
    }, [safeAddress, backendUser, setBackendUser, getPrivySigner]);

    // ─── Step 4: Derive API Credentials ────────────────────────────────

    const executeStep4 = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const signer = await getPrivySigner();
            const creds = await deriveOrCreateApiKey(signer);

            // Save encrypted credentials to backend
            await api.savePolymarketCredentials(creds);
            setCompletedSteps((prev) => new Set([...prev, 4]));

            if (backendUser) {
                await setBackendUser({
                    ...backendUser,
                    safeAddress: safeAddress || backendUser.safeAddress,
                    safeDeployed: true,
                    approvalsSet: true,
                    polymarketOnboardingStep: 4,
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

            // All done — go back to trade
            setTimeout(() => {
                router.back();
            }, 500);
        } catch (err: any) {
            console.error("[WalletSetup] Step 4 failed:", err);
            setError(err?.message || "Failed to create API credentials");
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsLoading(false);
        }
    }, [safeAddress, backendUser, setBackendUser, getPrivySigner, router]);

    // Auto-fire step 1 on mount if not completed
    useEffect(() => {
        if (currentStep === 1 && !completedSteps.has(1) && !isLoading) {
            executeStep1();
        }
    }, [currentStep, completedSteps, isLoading, executeStep1]);

    const handleStepAction = () => {
        if (isLoading) return;
        setError(null);

        switch (currentStep) {
            case 1:
                executeStep1();
                break;
            case 2:
                executeStep2();
                break;
            case 3:
                executeStep3();
                break;
            case 4:
                executeStep4();
                break;
        }
    };

    const handleSkip = () => {
        router.back();
    };

    const stepConfig = STEP_CONFIGS[currentStep];
    const isStepAutomatic = currentStep === 1;
    const canRetry = error !== null && !isLoading;

    return (
        <View style={styles.container}>
            <SafeAreaView style={styles.safeArea}>
                {/* Skip button */}
                <View style={styles.topBar}>
                    <TouchableOpacity onPress={handleSkip} style={styles.skipButton}>
                        <Text style={styles.skipText}>Later</Text>
                    </TouchableOpacity>
                </View>

                {/* Top spacer */}
                <View style={{ flex: 0.3 }} />

                {/* Header */}
                <Animated.View
                    style={[
                        styles.headerContainer,
                        { opacity: headerOpacity, transform: [{ translateY: headerSlide }] },
                    ]}
                >
                    <Text style={styles.title}>set up trading</Text>
                    <Text style={styles.subtitle}>
                        One-time setup to enable Polymarket trading. This takes about 30 seconds.
                    </Text>
                </Animated.View>

                {/* Progress Dots */}
                <Animated.View
                    style={[
                        styles.progressContainer,
                        { opacity: cardOpacity },
                    ]}
                >
                    {([1, 2, 3, 4] as SetupStep[]).map((step) => (
                        <View key={step} style={styles.progressDotWrapper}>
                            <View
                                style={[
                                    styles.progressDot,
                                    completedSteps.has(step) && styles.progressDotCompleted,
                                    currentStep === step && !completedSteps.has(step) && styles.progressDotActive,
                                ]}
                            >
                                {completedSteps.has(step) ? (
                                    <Ionicons name="checkmark" size={12} color="#fff" />
                                ) : (
                                    <Text
                                        style={[
                                            styles.progressDotText,
                                            currentStep === step && styles.progressDotTextActive,
                                        ]}
                                    >
                                        {step}
                                    </Text>
                                )}
                            </View>
                            {step < 4 && (
                                <View
                                    style={[
                                        styles.progressLine,
                                        completedSteps.has(step) && styles.progressLineCompleted,
                                    ]}
                                />
                            )}
                        </View>
                    ))}
                </Animated.View>

                {/* Step Card */}
                <Animated.View
                    style={[
                        styles.stepCard,
                        {
                            opacity: cardOpacity,
                            transform: [{ scale: cardScale }],
                        },
                    ]}
                >
                    <View style={styles.stepIconContainer}>
                        <Ionicons name={stepConfig.icon} size={32} color="#000" />
                    </View>
                    <Text style={styles.stepTitle}>{stepConfig.title}</Text>
                    <Text style={styles.stepSubtitle}>{stepConfig.subtitle}</Text>

                    {safeAddress && currentStep >= 2 && (
                        <View style={styles.safeAddressContainer}>
                            <Text style={styles.safeAddressLabel}>Safe Address</Text>
                            <Text style={styles.safeAddressValue} numberOfLines={1} ellipsizeMode="middle">
                                {safeAddress}
                            </Text>
                        </View>
                    )}

                    {error && (
                        <View style={styles.errorBanner}>
                            <Ionicons name="warning" size={14} color="#DC2626" />
                            <Text style={styles.errorText}>{error}</Text>
                        </View>
                    )}
                </Animated.View>

                {/* Bottom Spacer */}
                <View style={{ flex: 1 }} />

                {/* Action Button */}
                <Animated.View
                    style={[
                        styles.buttonContainer,
                        { transform: [{ translateY: buttonSlide }] },
                    ]}
                >
                    {isStepAutomatic && isLoading ? (
                        <View style={styles.autoProgressContainer}>
                            <ActivityIndicator size="small" color="#000" />
                            <Text style={styles.autoProgressText}>{stepConfig.action}</Text>
                        </View>
                    ) : (
                        <TouchableOpacity
                            onPress={canRetry ? handleStepAction : handleStepAction}
                            disabled={isLoading}
                            activeOpacity={0.85}
                            style={[
                                styles.actionButton,
                                isLoading
                                    ? styles.actionButtonDisabled
                                    : canRetry
                                        ? styles.actionButtonRetry
                                        : styles.actionButtonActive,
                            ]}
                        >
                            {isLoading ? (
                                <ActivityIndicator size="small" color="#9CA3AF" />
                            ) : (
                                <View style={styles.buttonInner}>
                                    <Text
                                        style={[
                                            styles.actionText,
                                            isLoading
                                                ? styles.actionTextDisabled
                                                : styles.actionTextActive,
                                        ]}
                                    >
                                        {canRetry ? "Retry" : stepConfig.action}
                                    </Text>
                                    <View
                                        style={[
                                            styles.arrowCircle,
                                            { backgroundColor: isLoading ? "#D1D5DB" : "#000" },
                                        ]}
                                    >
                                        <Ionicons
                                            name={canRetry ? "refresh" : "arrow-forward"}
                                            size={16}
                                            color="#fff"
                                        />
                                    </View>
                                </View>
                            )}
                        </TouchableOpacity>
                    )}
                </Animated.View>
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
    topBar: {
        flexDirection: "row",
        justifyContent: "flex-end",
        paddingHorizontal: 24,
        paddingTop: 8,
    },
    skipButton: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    skipText: {
        fontSize: 15,
        fontWeight: "600",
        color: "#9CA3AF",
    },
    headerContainer: {
        paddingHorizontal: 24,
        marginBottom: 32,
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
    progressContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: 40,
        marginBottom: 32,
    },
    progressDotWrapper: {
        flexDirection: "row",
        alignItems: "center",
    },
    progressDot: {
        width: 28,
        height: 28,
        borderRadius: 14,
        backgroundColor: "#E5E7EB",
        alignItems: "center",
        justifyContent: "center",
    },
    progressDotCompleted: {
        backgroundColor: "#22C55E",
    },
    progressDotActive: {
        backgroundColor: "#000",
    },
    progressDotText: {
        fontSize: 12,
        fontWeight: "700",
        color: "#9CA3AF",
    },
    progressDotTextActive: {
        color: "#fff",
    },
    progressLine: {
        width: 32,
        height: 2,
        backgroundColor: "#E5E7EB",
        marginHorizontal: 4,
    },
    progressLineCompleted: {
        backgroundColor: "#22C55E",
    },
    stepCard: {
        marginHorizontal: 24,
        backgroundColor: "#fff",
        borderRadius: 20,
        padding: 24,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 3,
        alignItems: "center",
    },
    stepIconContainer: {
        width: 64,
        height: 64,
        borderRadius: 20,
        backgroundColor: "#F3F4F6",
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 16,
    },
    stepTitle: {
        fontSize: 20,
        fontWeight: "800",
        color: "#000",
        marginBottom: 8,
        textAlign: "center",
    },
    stepSubtitle: {
        fontSize: 14,
        color: "#6B7280",
        lineHeight: 20,
        textAlign: "center",
    },
    safeAddressContainer: {
        marginTop: 16,
        backgroundColor: "#F9FAFB",
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 12,
        width: "100%",
    },
    safeAddressLabel: {
        fontSize: 11,
        fontWeight: "700",
        color: "#9CA3AF",
        textTransform: "uppercase",
        letterSpacing: 1.2,
        marginBottom: 4,
    },
    safeAddressValue: {
        fontSize: 13,
        fontWeight: "600",
        color: "#374151",
        fontFamily: "monospace",
    },
    errorBanner: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FEF2F2",
        paddingHorizontal: 14,
        paddingVertical: 10,
        borderRadius: 12,
        marginTop: 16,
        gap: 8,
        width: "100%",
    },
    errorText: {
        color: "#DC2626",
        fontSize: 13,
        fontWeight: "500",
        flex: 1,
    },
    buttonContainer: {
        paddingHorizontal: 24,
        paddingBottom: 16,
        paddingTop: 12,
    },
    autoProgressContainer: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 18,
        gap: 12,
    },
    autoProgressText: {
        fontSize: 16,
        fontWeight: "600",
        color: "#6B7280",
    },
    actionButton: {
        borderRadius: 18,
        paddingVertical: 18,
        paddingHorizontal: 24,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
    },
    actionButtonActive: {
        backgroundColor: "#FEEC28",
    },
    actionButtonDisabled: {
        backgroundColor: "#F3F4F6",
    },
    actionButtonRetry: {
        backgroundColor: "#FEF3C7",
    },
    buttonInner: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
    },
    actionText: {
        fontSize: 17,
        fontWeight: "700",
    },
    actionTextActive: {
        color: "#000",
    },
    actionTextDisabled: {
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
