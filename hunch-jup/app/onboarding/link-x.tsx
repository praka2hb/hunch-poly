import { useUser } from "@/contexts/UserContext";
import { api } from "@/lib/api";
import { useLinkWithOAuth, usePrivy } from "@privy-io/expo";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function LinkXScreen() {
    const router = useRouter();
    const { user } = usePrivy();
    const { backendUser, setBackendUser } = useUser();
    const [isLinking, setIsLinking] = useState(false);
    const [error, setError] = useState("");

    const { link, state } = useLinkWithOAuth({
        onError: (err) => {
            console.error("[Link X] OAuth link failed:", err);
            setIsLinking(false);
            if (err?.message && !err.message.includes("cancelled")) {
                setError(err.message);
            }
        },
    });

    const handleLinkX = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setError("");
        setIsLinking(true);
        try {
            const linkedUser = await link({ provider: "twitter" });
            setIsLinking(false);

            // Re-sync with backend after linking X so it knows about the new linked account
            if (!user) {
                setError("User session not found. Please try logging in again.");
                return;
            }

            const twitterAccount = (linkedUser as any)?.linked_accounts?.find((a: any) => a.type === "twitter_oauth");
            const rawUsername = twitterAccount?.username || twitterAccount?.screen_name || "";
            const normalizedUsername = String(rawUsername).replace(/^@+/, "").trim().toLowerCase();
            const displayName = (twitterAccount as any)?.name || normalizedUsername;

            try {
                // Re-bootstrap to sync the linked X account with backend
                // Do NOT pass username here — let the user pick it on the username screen
                const bootstrap = await api.bootstrapOAuthUser({
                    privyId: user.id,
                    provider: 'twitter',
                    linkedAccounts: (linkedUser as any)?.linked_accounts || [],
                    displayName: displayName,
                });

                // Navigate FIRST without params, THEN update context to prevent AuthFlowGate race
                router.replace("/onboarding/username");
                
                // Save onboarding progress after navigation
                try {
                    await api.saveOnboardingProgress({ step: "USERNAME" });
                } catch (progressError) {
                    console.warn("[Link X] Failed to save onboarding progress:", progressError);
                }

                // Update backend user context after navigation completes
                await setBackendUser({ ...bootstrap.user, username: null, onboardingStep: 'USERNAME' });
            } catch (bootstrapError) {
                console.error("[Link X] Bootstrap failed:", bootstrapError);
                setError("Failed to sync X account. Please try again.");
            }
        } catch (err) {
            setIsLinking(false);
            if ((err as Error)?.message && !(err as Error).message.includes("cancelled")) {
                setError((err as Error).message);
            }
        }
    };

    const handleSkip = async () => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        try {
            await api.saveOnboardingProgress({ step: "USERNAME" });
        } catch (progressError) {
            console.warn("[Link X] Failed to save onboarding progress:", progressError);
        }
        // Update context so AuthFlowGate stays in sync
        if (backendUser) {
            await setBackendUser({ ...backendUser, onboardingStep: 'USERNAME' });
        }
        router.replace("/onboarding/username");
    };

    return (
        <View className="flex-1 bg-white">
            <SafeAreaView className="flex-1 flex-col justify-between">

                {/* Main Content: Image & Headline */}
                <View className="flex-1 justify-center items-center px-8">
                    <Image
                        source={require("../../assets/images/x.jpg")}
                        style={{ width: 180, height: 180, borderRadius: 32 }}
                        resizeMode="contain"
                    />
                    <Text className="text-2xl font-bold text-gray-900 mt-8 text-center">
                        Connect X
                    </Text>
                    <Text className="text-base text-gray-500 mt-2 text-center">
                        Link your X account to verify your identity and auto-fill your profile.
                    </Text>

                    {error ? (
                        <Text className="text-sm text-red-600 mt-6 text-center">{error}</Text>
                    ) : null}
                </View>

                {/* Bottom Actions */}
                <View className="px-6 pb-6 pt-2">
                    <TouchableOpacity
                        onPress={handleLinkX}
                        disabled={isLinking || state.status === "loading"}
                        activeOpacity={0.8}
                        className="rounded-full py-4 flex-row items-center justify-center mb-3"
                        style={{ backgroundColor: "#FEEC28" }}
                    >
                        {isLinking || state.status === "loading" ? (
                            <ActivityIndicator size="small" color="#000000" />
                        ) : (
                            <Text className="font-bold text-gray-900 text-base">
                                Connect X
                            </Text>
                        )}
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={handleSkip}
                        activeOpacity={0.6}
                        className="py-4 items-center justify-center"
                    >
                        <Text className="font-semibold text-gray-400 text-base">
                            Skip for now
                        </Text>
                    </TouchableOpacity>
                </View>

            </SafeAreaView>
        </View>
    );
}
