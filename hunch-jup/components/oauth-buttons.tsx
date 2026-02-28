import { Ionicons } from "@expo/vector-icons";
import { useLoginWithOAuth } from "@privy-io/expo";
import { useState } from "react";
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from "react-native";

export default function OAuthButtons() {
    const [error, setError] = useState("");

    const oauth = useLoginWithOAuth({
        onError: (err) => {
            console.log(err);
            // Don't show error message if user cancelled the OAuth flow
            if (err.message && !err.message.includes("cancelled")) {
                setError(err.message);
            }
        },
    });

    const handleLogin = (provider: "google" | "twitter") => {
        setError("");
        oauth.login({ provider });
    };

    const isLoading = oauth.state.status === "loading";

    return (
        <View style={styles.container}>
            <TouchableOpacity
                style={[styles.button, styles.googleButton]}
                disabled={isLoading}
                onPress={() => handleLogin("google")}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="logo-google" size={20} color="#FFFFFF" />
                        <Text style={styles.buttonText}>Continue with Google</Text>
                    </>
                )}
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.button, styles.twitterButton]}
                disabled={isLoading}
                onPress={() => handleLogin("twitter")}
            >
                {isLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                    <>
                        <Ionicons name="logo-twitter" size={20} color="#FFFFFF" />
                        <Text style={styles.buttonText}>Continue with X</Text>
                    </>
                )}
            </TouchableOpacity>

            {error && (
                <View style={styles.errorContainer}>
                    <Text style={styles.error}>{error}</Text>
                </View>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        gap: 16,
        width: "100%",
    },
    button: {
        padding: 16,
        borderRadius: 12,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "row",
        gap: 12,
        shadowColor: "#000000",
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    googleButton: {
        backgroundColor: "#4285F4",
    },
    twitterButton: {
        backgroundColor: "#000000",
    },
    buttonText: {
        color: "#FFFFFF",
        fontSize: 16,
        fontWeight: "600",
    },
    errorContainer: {
        backgroundColor: "#FEE2E2",
        padding: 12,
        borderRadius: 8,
        borderLeftWidth: 4,
        borderLeftColor: "#EF4444",
    },
    error: {
        color: "#991B1B",
        fontSize: 14,
    },
});
