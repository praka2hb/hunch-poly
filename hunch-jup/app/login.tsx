import FakeNotificationStack from "@/components/FakeNotificationStack";
import { useUser } from "@/contexts/UserContext";
import { api } from "@/lib/api";
import { useLoginWithOAuth, usePrivy } from "@privy-io/expo";
import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";

import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Animated, Dimensions, Image, Modal, Platform, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const { width, height } = Dimensions.get('window');

const HERO_FRAMES = [
    require('@/assets/frame1.png'),
    require('@/assets/frame2.png'),
    require('@/assets/frame3.png'),
];
// Frame indices: 0=frame1, 1=frame2, 2=frame3. Random but frame2 always between 1 and 3.
const FRAME_INTERVAL_MS = 180;

function nextRandomFrame(current: number): number {
  if (current === 0) return Math.random() < 0.5 ? 0 : 1; // frame1 → frame1 or frame2
  if (current === 2) return Math.random() < 0.5 ? 2 : 1; // frame3 → frame3 or frame2
  return [0, 1, 2][Math.floor(Math.random() * 3)];      // frame2 → frame1, frame2, or frame3
}

export default function LoginScreen() {
    const { user, isReady } = usePrivy();
    const { setBackendUser, backendUser, setDevMode } = useUser();
    const [error, setError] = useState("");
    const [loadingProvider, setLoadingProvider] = useState<string | null>(null);
    const [isSyncing, setIsSyncing] = useState(false);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [walletPendingRetry, setWalletPendingRetry] = useState(false);
    const [showDevLogin, setShowDevLogin] = useState(false);
    const [devCode, setDevCode] = useState("");
    const syncLockRef = useRef(false);
    const insets = useSafeAreaInsets();

    // Animation refs
    const mascotScale = useRef(new Animated.Value(0.8)).current;
    const mascotOpacity = useRef(new Animated.Value(0)).current;
    const buttonSlide = useRef(new Animated.Value(100)).current;
    const [heroFrameIndex, setHeroFrameIndex] = useState(0);
    const [triangleVisible, setTriangleVisible] = useState(true);

    const inferProvider = (linkedAccounts: Array<any> = []): "apple" | "twitter" | "google" => {
        if (linkedAccounts.some((a) => a.type === "apple_oauth")) return "apple";
        if (linkedAccounts.some((a) => a.type === "google_oauth")) return "google";
        return "twitter";
    };

    const isApplePrivateRelay = (email?: string): boolean => {
        if (!email) return false;
        return email.endsWith('@privaterelay.appleid.com');
    };

    const isRandomAppleString = (name?: string): boolean => {
        if (!name) return true;
        // Apple sometimes sets display name to random strings or empty values
        // Detect strings that look auto-generated (no spaces, mostly alphanumeric noise)
        const trimmed = name.trim();
        if (!trimmed || trimmed.length < 2) return true;
        // If the name is just a long alphanumeric string with no spaces, it's likely random
        if (/^[a-z0-9]{8,}$/i.test(trimmed)) return true;
        return false;
    };

    const extractUsernameAndDisplayName = (linkedAccounts: Array<any> = []): { username?: string; displayName?: string } => {
        const twitter = linkedAccounts.find((a: any) => a.type === "twitter_oauth");
        const apple = linkedAccounts.find((a: any) => a.type === "apple_oauth");
        const google = linkedAccounts.find((a: any) => a.type === "google_oauth");
        const email = linkedAccounts.find((a: any) => a.type === "email");

        const account = twitter || apple || google || email;
        if (!account) return {};

        const rawUsername = (account as any)?.username ?? (account as any)?.screen_name;
        const username = rawUsername ? String(rawUsername).replace(/^@+/, "").trim() : undefined;

        // For Apple sign-in: avoid using random relay email prefix or auto-generated strings
        let displayName: string | undefined;
        const accountName = (account as any)?.name;
        const accountEmail = (account as any)?.email;

        if (apple && account === apple) {
            // Apple sign-in: only use name if it looks like a real name
            if (accountName && !isRandomAppleString(accountName)) {
                displayName = accountName;
            }
            // Don't fall back to email prefix for Apple private relay
            // displayName will be set later from the claimed username
        } else {
            displayName =
                accountName ||
                (accountEmail ? accountEmail.split("@")[0] : undefined) ||
                username;
        }

        return { username: username || undefined, displayName: displayName || undefined };
    };

    const oauth = useLoginWithOAuth({
        onError: (err) => {
            console.error('[Apple OAuth Error]', JSON.stringify(err, null, 2));
            console.error('[Error Details]', {
                message: err.message,
                name: err.name,
                stack: err.stack,
                cause: err.cause
            });
            setLoadingProvider(null);
            if (err.message && !err.message.includes("cancelled")) {
                if (err.message.includes("Unable to exchange oauth code for provider")) {
                    setError("Apple login is temporarily unavailable. Please retry, or continue with X.");
                } else {
                    setError(err.message);
                }
            }
        },
        onSuccess: (...args: any[]) => {
            const [user, isNewUser, wasAlreadyAuthenticated, loginMethod, linkedAccount] = args;
            console.log('========== APPLE OAUTH SUCCESS ==========');
            console.log('[OAuth Success] Is New User:', isNewUser);
            console.log('[OAuth Success] Was Already Authenticated:', wasAlreadyAuthenticated);
            console.log('[OAuth Success] Login Method:', loginMethod);
            console.log('[OAuth Success] Linked Account:', JSON.stringify(linkedAccount, null, 2));
            console.log('[OAuth Success] Full User Object:', JSON.stringify(user, null, 2));

            // Log specific Apple account details
            const appleAccount = user?.linked_accounts?.find((a: any) => a.type === 'apple_oauth');
            if (appleAccount) {
                console.log('========== APPLE ACCOUNT DETAILS ==========');
                console.log('[Apple Account]', JSON.stringify(appleAccount, null, 2));
            }

            console.log('==========================================');
            setDrawerOpen(false);
            // Keep loadingProvider set — cleared when sync completes
        },
    });

    // Entry animations
    useEffect(() => {
        Animated.parallel([
            Animated.spring(mascotScale, {
                toValue: 1,
                useNativeDriver: true,
                tension: 50,
                friction: 7,
            }),
            Animated.timing(mascotOpacity, {
                toValue: 1,
                duration: 600,
                useNativeDriver: true,
            }),
            Animated.spring(buttonSlide, {
                toValue: 0,
                useNativeDriver: true,
                tension: 60,
                friction: 10,
                delay: 300,
            }),
        ]).start();
    }, []);

    // Cycle hero frames randomly (frame2 always between frame1 and frame3)
    useEffect(() => {
        const interval = setInterval(() => {
            setHeroFrameIndex((i) => nextRandomFrame(i));
        }, FRAME_INTERVAL_MS);
        return () => clearInterval(interval);
    }, []);

    // Triangle: show 0.5s, hide 0.5s (instant toggle, no fade)
    useEffect(() => {
        const interval = setInterval(() => {
            setTriangleVisible((v) => !v);
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Force-close drawer when authenticated (prevents drawer appearing on Home during nav)
    useEffect(() => {
        if (backendUser) setDrawerOpen(false);
    }, [backendUser]);

    useEffect(() => {
        const syncUser = async () => {
            if (!isReady || !user || backendUser || walletPendingRetry || syncLockRef.current) return;

            syncLockRef.current = true;
            setIsSyncing(true);
            setError("");
            console.log('========== SYNCING USER WITH BACKEND ==========');
            console.log('[Sync] Privy User ID:', user.id);
            console.log('[Sync] Linked Accounts:', JSON.stringify(user.linked_accounts, null, 2));

            const maxRetries = 3;
            const retryDelayMs = 2000;
            const walletAccount = (user.linked_accounts || []).find((a: any) => a.type === "wallet" || a.type === "embedded_wallet");
            const walletAddress = (walletAccount as any)?.address as string | undefined;

            try {
                for (let attempt = 1; attempt <= maxRetries; attempt++) {
                    try {
                        const { username: extractedUsername, displayName: extractedDisplayName } = extractUsernameAndDisplayName(
                            user.linked_accounts || []
                        );

                        const bootstrap = await api.bootstrapOAuthUser({
                            privyId: user.id,
                            provider: inferProvider(user.linked_accounts || []),
                            linkedAccounts: (user.linked_accounts || []) as Array<Record<string, any>>,
                            username: extractedUsername,
                            displayName: extractedDisplayName,
                        });

                        if (!bootstrap.walletReady) {
                            if (attempt < maxRetries) {
                                setError(`Creating your wallet... (${attempt}/${maxRetries})`);
                                await new Promise((r) => setTimeout(r, retryDelayMs));
                                continue;
                            }
                            setError("Wallet setup is still in progress. Please try again in a moment.");
                            setWalletPendingRetry(true);
                            return;
                        }

                        // Set the backend user — AuthFlowGate will handle navigation
                        await setBackendUser(bootstrap.user);
                        return;
                    } catch (err: any) {
                        const message = err?.message || "";
                        const shouldFallbackToSync = walletAddress && (message.includes("Unique constraint failed") || message.includes("privyId"));
                        if (shouldFallbackToSync) {
                            const { username: extractedUsername, displayName: extractedDisplayName } = extractUsernameAndDisplayName(
                                user.linked_accounts || []
                            );
                            const syncedUser = await api.syncUser({
                                privyId: user.id,
                                walletAddress,
                                displayName: extractedDisplayName || extractedUsername,
                            });
                            // Set the backend user — AuthFlowGate will handle navigation
                            await setBackendUser(syncedUser);
                            return;
                        }

                        console.error("Failed to sync user:", err);
                        if (attempt >= maxRetries) {
                            setError("Failed to sync user with backend");
                            setWalletPendingRetry(true);
                            return;
                        }
                        await new Promise((r) => setTimeout(r, retryDelayMs));
                    }
                }
            } finally {
                setIsSyncing(false);
                setLoadingProvider(null);
                syncLockRef.current = false;
                console.log('========== SYNC COMPLETE ==========');
            }
        };

        syncUser();
    }, [isReady, user, backendUser, walletPendingRetry]);

    const openDrawer = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDrawerOpen(true);
    };

    const closeDrawer = () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setDrawerOpen(false);
    };

    const DEV_CODE = "6767";

    const handleDevLogin = async () => {
        if (devCode !== DEV_CODE) {
            setError("Invalid dev code");
            return;
        }
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setLoadingProvider("dev");
        setError("");

        const devUser = {
            id: "dev-user-001",
            privyId: "dev-privy-001",
            walletAddress: "DevWa11etXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
            displayName: "Dev Tester",
            username: "devtester",
            avatarUrl: null,
            followerCount: 0,
            followingCount: 0,
            onboardingStep: "COMPLETE" as const,
            hasCompletedOnboarding: true,
            walletReady: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        await setDevMode(true);
        await setBackendUser(devUser);
        setLoadingProvider(null);
    };

    const handleLogin = (provider: "google" | "twitter" | "apple") => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setError("");
        setWalletPendingRetry(false);
        setDrawerOpen(false);
        setLoadingProvider(provider);
        console.log(`[Login] Starting ${provider} OAuth flow...`);
        console.log('[Login] App Config:', {
            bundleId: 'com.hunch.run',
            scheme: 'hunch',
            privyAppId: 'cmiq91u0h006jl70cuyb6az3f'
        });
        oauth.login({ provider });
    };

    const isRedirectingOrSyncing = loadingProvider !== null || isSyncing;

    // Never show drawer when redirecting, syncing, or authenticated
    const shouldShowDrawer = drawerOpen && !backendUser && !isRedirectingOrSyncing;

    return (
        <View style={styles.container}>
            {/* Full-screen loading overlay when returning from OAuth or syncing */}
            {isRedirectingOrSyncing && (
                <View style={styles.loadingOverlay} pointerEvents="box-only">
                    <ActivityIndicator size="large" color="#000" />
                    <Text style={styles.loadingOverlayText}>Signing you in...</Text>
                </View>
            )}

            {/* Animated hero (frame1 → frame2 → frame3) */}
            <Animated.View
                style={[
                    styles.heroContainer,
                    {
                        opacity: mascotOpacity,
                        transform: [{ scale: mascotScale }],
                    }
                ]}
            >
                <View style={styles.heroImageWrap}>
                    <Image
                        source={HERO_FRAMES[heroFrameIndex]}
                        style={styles.heroImage}
                        resizeMode="contain"
                    />
                </View>
                {/* Play-arrow badge on hat — appears/disappears every 0.5s */}
                <Image
                    source={require('@/assets/play-arrow.png')}
                    style={[styles.hatPlayArrow, { opacity: triangleVisible ? 1 : 0 }]}
                    resizeMode="contain"
                />
            </Animated.View>

            <View style={styles.bottomArea}>
                <View style={styles.content}>
                    <FakeNotificationStack />
                    {/* Continue Button */}
                    <Animated.View
                        style={[
                            styles.buttonContainer,
                            { transform: [{ translateY: buttonSlide }] }
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.continueButton}
                            onPress={openDrawer}
                            activeOpacity={0.85}
                        >
                            <Text style={styles.continueButtonText}>Continue</Text>
                        </TouchableOpacity>
                    </Animated.View>

                    {/* Error Message */}
                    {error ? (
                        <View style={styles.errorContainer}>
                            <Text style={styles.errorText}>{error}</Text>
                            {walletPendingRetry ? (
                                <TouchableOpacity
                                    onPress={() => {
                                        setWalletPendingRetry(false);
                                        setError("");
                                    }}
                                    style={styles.retryButton}
                                    activeOpacity={0.8}
                                >
                                    <Text style={styles.retryButtonText}>Retry</Text>
                                </TouchableOpacity>
                            ) : null}
                        </View>
                    ) : null}
                </View>
            </View>

            {/* Login Drawer — hide when authenticated or redirecting to avoid showing on Home */}
            <Modal
                visible={shouldShowDrawer}
                transparent
                animationType="slide"
                onRequestClose={closeDrawer}
            >
                <View style={styles.drawerOverlay}>
                    <Pressable style={styles.drawerDismissArea} onPress={closeDrawer}>
                        <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                        <View style={styles.drawerBackdrop} />
                    </Pressable>
                    <View
                        style={[
                            styles.drawer,
                            { paddingBottom: Math.max(insets.bottom, 24) },
                        ]}
                    >
                            <View style={styles.drawerHandle} />
                            
                            <TouchableOpacity
                                style={styles.drawerButton}
                                onPress={() => handleLogin("twitter")}
                                disabled={loadingProvider !== null}
                                activeOpacity={0.85}
                            >
                                {loadingProvider === "twitter" ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={styles.drawerButtonText}>Continue with </Text>
                                        <Text style={styles.drawerButtonXLogo}>X</Text>
                                    </>
                                )}
                            </TouchableOpacity>

                            <View style={styles.drawerOrRow}>
                                <View style={styles.drawerOrLine} />
                                <Text style={styles.drawerOr}>or</Text>
                                <View style={styles.drawerOrLine} />
                            </View>

                            <TouchableOpacity
                                style={styles.drawerButton}
                                onPress={() => handleLogin("apple")}
                                disabled={loadingProvider !== null}
                                activeOpacity={0.85}
                            >
                                {loadingProvider === "apple" ? (
                                    <ActivityIndicator size="small" color="#fff" />
                                ) : (
                                    <>
                                        <Text style={styles.drawerButtonText}>Continue with </Text>
                                        <Ionicons name="logo-apple" size={24} color="#fff" style={{ marginLeft: 6 }} />
                                    </>
                                )}
                            </TouchableOpacity>

                            {!showDevLogin ? (
                                <TouchableOpacity
                                    onPress={() => setShowDevLogin(true)}
                                    activeOpacity={0.6} 
                                    style={styles.devToggle}
                                >
                                    <Text className="" style={styles.devToggleText}>Dev Login</Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={styles.devLoginContainer}>
                                    <TextInput
                                        style={styles.devCodeInput}
                                        placeholder="Enter dev code"
                                        placeholderTextColor="#999"
                                        keyboardType="number-pad"
                                        maxLength={4}
                                        value={devCode}
                                        onChangeText={setDevCode}
                                        secureTextEntry
                                    />
                                    <TouchableOpacity
                                        style={styles.devLoginButton}
                                        onPress={handleDevLogin}
                                        disabled={loadingProvider === "dev"}
                                        activeOpacity={0.85}
                                    >
                                        {loadingProvider === "dev" ? (
                                            <ActivityIndicator size="small" color="#fff" />
                                        ) : (
                                            <Text style={styles.devLoginButtonText}>Go</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>
                            )}

                            <TouchableOpacity style={styles.drawerCloseButton} onPress={closeDrawer} activeOpacity={0.8}>
                               </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#fde704',
    },
    loadingOverlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(253, 231, 4, 0.95)',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
    },
    loadingOverlayText: {
        marginTop: 16,
        fontSize: 18,
        fontWeight: '600',
        color: '#000',
    },
    bottomArea: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        paddingBottom: 80,
    },
    content: {
        flex: 1,
        alignItems: 'center',
        paddingHorizontal: 24,
    },
    heroContainer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 60,
    },
    heroImageWrap: {
        width: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 40,
    },
    hatPlayArrow: {
        position: 'absolute',
        top: height * 0.42,
        right: width * 0.14,
        width: 64,
        height: 64,
    },
    heroImage: {
        width: width * 0.9,
        height: height * 0.6,
    },
    buttonContainer: {
        width: '100%',
        paddingHorizontal: 20,
    },
    continueButton: {
        backgroundColor: '#000000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 18,
        paddingHorizontal: 8,
        borderRadius: 16,
        borderColor: '#fde704',
        borderWidth: 1,
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 6,
    },
    continueButtonText: {
        color: '#fde704',
        fontSize: 28,
        fontWeight: '600',
        letterSpacing: 0.5,
        fontFamily: Platform.select({ ios: 'ui-rounded', default: 'Inter_400Regular' }),
    },
    drawerOverlay: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    drawerDismissArea: {
        flex: 1,
        position: 'relative',
    },
    drawerBackdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.35)',
    },
    drawer: {
        backgroundColor: '#fde704',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        paddingHorizontal: 32,
        paddingTop: 24,
    },
    drawerHandle: {
        width: 48,
        height: 5,
        borderRadius: 2.5,
        backgroundColor: '#D1D5DB',
        alignSelf: 'center',
        marginBottom: 24,
    },
    drawerTitle: {
        fontSize: 22,
        fontWeight: '600',
        color: '#000000',
        marginBottom: 24,
        textAlign: 'center',
    },
    drawerButton: {
        backgroundColor: '#000000',
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        paddingHorizontal: 32,
        borderRadius: 18,
        marginBottom: 16,
    },
    drawerButtonText: {
        color: '#FFFFFF',
        fontSize: 20,
        fontWeight: '700',
    },
    drawerButtonXLogo: {
        color: '#FFFFFF',
        fontSize: 22,
        fontWeight: '800',
        marginLeft: 6,
    },
    drawerOrRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 12,
        gap: 12,
    },
    drawerOrLine: {
        flex: 1,
        height: 1,
        backgroundColor: 'rgba(0,0,0,0.2)',
    },
    drawerOr: {
        color: '#000',
        fontSize: 16,
        fontWeight: '600',
    },
    drawerCloseButton: {
        paddingVertical: 20,
        alignItems: 'center',
        marginTop: 12,
    },
    drawerCloseText: {
        color: '#6B7280',
        fontSize: 18,
        fontWeight: '600',
    },
    errorContainer: {
        position: 'absolute',
        bottom: 180,
        paddingHorizontal: 20,
        paddingVertical: 12,
        backgroundColor: 'rgba(255, 0, 0, 0.1)',
        borderRadius: 12,
        alignItems: 'center',
    },
    errorText: {
        color: '#CC0000',
        fontSize: 14,
        textAlign: 'center',
        fontWeight: '500',
    },
    retryButton: {
        marginTop: 10,
        paddingVertical: 8,
        paddingHorizontal: 20,
        backgroundColor: '#000000',
        borderRadius: 12,
    },
    retryButtonText: {
        color: '#FFFFFF',
        fontSize: 14,
        fontWeight: '600',
    },
    devToggle: {
        alignItems: 'center',
        paddingVertical: 10,
        marginTop: 4,
    },
    devToggleText: {
        fontSize: 13,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    devLoginContainer: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 8,
    },
    devCodeInput: {
        flex: 1,
        backgroundColor: '#F3F4F6',
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 14,
        fontSize: 16,
        fontWeight: '600',
        color: '#000',
        letterSpacing: 4,
        textAlign: 'center',
    },
    devLoginButton: {
        backgroundColor: '#000',
        borderRadius: 12,
        paddingHorizontal: 24,
        justifyContent: 'center',
        alignItems: 'center',
    },
    devLoginButtonText: {
        color: '#fff',
        fontSize: 16,
        fontWeight: '700',
    },
});

