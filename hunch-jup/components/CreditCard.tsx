import { sendUSDC } from "@/lib/tradeService";
import { Ionicons } from "@expo/vector-icons";
import { useFundSolanaWallet } from '@privy-io/expo/ui';
import { Connection } from "@solana/web3.js";
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from "expo-linear-gradient";
import { useRef, useState } from "react";
import { Animated, Dimensions, Image, ImageBackground, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import WithdrawSheet from "./WithdrawSheet";

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 40;
const CARD_HEIGHT = CARD_WIDTH * 0.63; // ~1.586 aspect ratio

// Import theme from central location

// Theme constants for card overlay
const TEXT_PRIMARY = '#FFFFFF';
const TEXT_SECONDARY = 'rgba(255, 255, 255, 0.7)';

interface CreditCardProps {
    tradesCount: number;
    balance?: number;
    walletAddress?: string;
    /** Embedded Solana wallet instance (Privy) */
    wallet?: any;
    /** Privy wallet provider — used for signing USDC transfers */
    walletProvider?: any;
    /** Solana connection — used for sending transfer tx */
    connection?: Connection;
    /** Called with the withdrawn amount immediately after tx confirms */
    onWithdrawSuccess?: (amount: number) => void;
}

export default function CreditCard({ tradesCount, balance = 0, walletAddress, wallet, walletProvider, connection, onWithdrawSuccess }: CreditCardProps) {
    const [isFlipped, setIsFlipped] = useState(false);
    const [copied, setCopied] = useState(false);
    const [withdrawOpen, setWithdrawOpen] = useState(false);
    const [withdrawSubmitting, setWithdrawSubmitting] = useState(false);
    const flipAnimation = useRef(new Animated.Value(0)).current;
    const { fundWallet } = useFundSolanaWallet();

    const toggleFlip = () => {
        Animated.spring(flipAnimation, {
            toValue: isFlipped ? 0 : 1,
            friction: 8,
            tension: 10,
            useNativeDriver: true,
        }).start();
        setIsFlipped(!isFlipped);
    };

    const copyAddress = async () => {
        if (walletAddress) {
            await Clipboard.setStringAsync(walletAddress);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const frontInterpolate = flipAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: ['0deg', '180deg'],
    });

    const backInterpolate = flipAnimation.interpolate({
        inputRange: [0, 1],
        outputRange: ['180deg', '360deg'],
    });

    const frontAnimatedStyle = {
        transform: [{ rotateY: frontInterpolate }],
    };

    const backAnimatedStyle = {
        transform: [{ rotateY: backInterpolate }],
    };

    return (
        <View style={styles.container}>
            <TouchableOpacity onPress={toggleFlip} activeOpacity={0.9}>
                <View style={styles.cardContainer}>
                    {/* Front of the card */}
                    <Animated.View
                        style={[styles.card, frontAnimatedStyle]}
                        // Ensure the "hidden" side never receives taps
                        pointerEvents={isFlipped ? "none" : "auto"}
                    >
                        <ImageBackground
                            source={require('../assets/cardbg.png')}
                            style={styles.textureBackground}
                            imageStyle={styles.textureImage}
                        >
                            <Image
                                source={require('../assets/images/texture.jpeg')}
                                style={styles.textureOverlay}
                                resizeMode="cover"
                            />
                            <LinearGradient
                                // Blue/Slate gradient overlay with transparency
                                colors={[
                                    'rgba(254, 240, 138, 0.44)',
                                    'rgba(250, 204, 21, 0.45)',
                                    'rgba(253, 224, 71, 0.55)'
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.gradient}
                            >
                                {/* Shine Effect - subtle top highlight */}
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.3)', 'rgba(255,255,255,0.1)', 'transparent']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />

                                {/* Card Content */}
                                <View style={styles.contentContainer}>
                                    {/* Top Row */}
                                    <View style={styles.topRow}>
                                        <Text style={styles.tapText}>TAP TO FLIP</Text>
                                    </View>

                                    {/* Middle Row - Cash Balance */}
                                    <View style={styles.balanceSection}>
                                        <Text className="text-sm text-txt-primary" style={styles.label}>Cash Balance</Text>
                                        <Text style={styles.balanceValue}>${balance.toFixed(2)}</Text>
                                    </View>

                                    {/* Bottom Row - Stats */}
                                    <View style={styles.statsRow}>
                                        <View>
                                            <Text style={styles.labelSmall}>Total Bets</Text>
                                            <Text style={styles.statValue}>{tradesCount}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                            <Text style={styles.labelSmall}>P&L</Text>
                                            <Text style={styles.statValueDim}>--</Text>
                                        </View>
                                    </View>
                                </View>
                            </LinearGradient>
                        </ImageBackground>
                    </Animated.View>

                    {/* Back of the card */}
                    <Animated.View
                        style={[styles.card, styles.cardBack, backAnimatedStyle]}
                        // Ensure the "hidden" side never receives taps
                        pointerEvents={isFlipped ? "auto" : "none"}
                    >
                        <ImageBackground
                            source={require('../assets/cardbg.png')}
                            style={styles.textureBackground}
                            imageStyle={styles.textureImage}
                        >
                            <Image
                                source={require('../assets/images/texture.jpeg')}
                                style={styles.textureOverlay}
                                resizeMode="cover"
                            />
                            <LinearGradient
                                // Light gray gradient overlay with transparency
                                colors={[
                                    'rgba(241, 245, 249, 0.5)',
                                    'rgba(226, 232, 240, 0.5)',
                                    'rgba(203, 213, 225, 0.5)'
                                ]}
                                start={{ x: 0, y: 0 }}
                                end={{ x: 1, y: 1 }}
                                style={styles.gradient}
                            >
                                {/* Shine Effect - subtle top highlight */}
                                <LinearGradient
                                    colors={['rgba(255,255,255,0.4)', 'rgba(255,255,255,0.1)', 'transparent']}
                                    start={{ x: 0, y: 0 }}
                                    end={{ x: 1, y: 1 }}
                                    style={StyleSheet.absoluteFillObject}
                                />

                                <View style={styles.contentContainer}>
                                    {/* Top Row - Copy Address */}
                                    <View style={styles.topRowBack}>
                                        {/* Disabled on the back: only Deposit/Withdraw are actionable */}
                                        <View style={[styles.copyButton, styles.copyButtonDisabled]}>
                                            {copied ? (
                                                <>
                                                    <Ionicons name="checkmark" size={16} color="#4ade80" />
                                                    <Text style={styles.copiedText}>Copied!</Text>
                                                </>
                                            ) : (
                                                <Ionicons name="copy-outline" size={16} color="rgba(255,255,255,0.45)" />
                                            )}
                                        </View>
                                    </View>

                                    <View style={{ flex: 1 }} />

                                    {/* Action Buttons */}
                                    <View style={styles.actionRow}>
                                        <TouchableOpacity
                                            style={styles.actionButton}
                                            disabled={!isFlipped}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                if (!isFlipped) return;
                                                if (!walletAddress) return;
                                                fundWallet({
                                                    asset: 'USDC',
                                                    address: walletAddress,
                                                    amount: "10", // SOL
                                                });
                                            }}
                                        >
                                            <Ionicons name="arrow-down" size={18} color="#FFF" />
                                            <Text style={styles.actionText}>Deposit</Text>
                                        </TouchableOpacity>

                                        <TouchableOpacity
                                            style={[styles.actionButton, styles.withdrawButton]}
                                            disabled={!isFlipped}
                                            onPress={(e) => {
                                                e.stopPropagation();
                                                if (!isFlipped) return;
                                                setWithdrawOpen(true);
                                            }}
                                        >
                                            <Ionicons name="arrow-up" size={18} color="#1e293b" />
                                            <Text style={[styles.actionText, styles.withdrawButtonText]}>Withdraw</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <Text style={styles.tapBackText}>Tap to flip back</Text>
                                </View>
                            </LinearGradient>
                        </ImageBackground>
                    </Animated.View>
                </View>
            </TouchableOpacity>

            <WithdrawSheet
                visible={withdrawOpen}
                onClose={() => setWithdrawOpen(false)}
                submitting={withdrawSubmitting}
                balance={balance}
                onSubmit={async ({ toAddress, amount }) => {
                    if (!walletAddress || !walletProvider || !connection) {
                        console.warn('CreditCard: walletProvider or connection not provided, cannot withdraw');
                        setWithdrawOpen(false);
                        return;
                    }
                    try {
                        setWithdrawSubmitting(true);
                        await sendUSDC({
                            provider: walletProvider,
                            wallet,
                            connection,
                            fromAddress: walletAddress,
                            toAddress,
                            amount,
                            type: 'withdraw',
                        });
                        // Optimistic update — instant balance feedback
                        onWithdrawSuccess?.(amount);
                        setWithdrawOpen(false);
                    } catch (err) {
                        console.error('Withdraw USDC error:', err);
                    } finally {
                        setWithdrawSubmitting(false);
                    }
                }}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        alignItems: 'center',
    },
    cardContainer: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
    },
    card: {
        width: CARD_WIDTH,
        height: CARD_HEIGHT,
        borderRadius: 24,
        position: 'absolute',
        backfaceVisibility: 'hidden',
        overflow: 'hidden',
        // Shadow for "dark theme"
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.5,
        shadowRadius: 20,
        elevation: 10,
    },
    cardBack: {
        transform: [{ rotateY: '180deg' }],
    },
    gradient: {
        flex: 1,
        padding: 24,
    },
    textureBackground: {
        flex: 1,
        borderRadius: 24,
        overflow: 'hidden',
    },
    textureImage: {
        borderRadius: 20,
        opacity: 0.6,
    },
    textureOverlay: {
        ...StyleSheet.absoluteFillObject,
        opacity: 0.35,
    },
    contentContainer: {
        flex: 1,
        justifyContent: 'space-between',
    },
    // Text Styles
    topRow: {
        alignItems: 'flex-end',
    },
    tapText: {
        fontSize: 10,
        color: 'rgba(0,0,0,0.6)',
        letterSpacing: 1,
        fontWeight: '600',
    },
    balanceSection: {
        flex: 1,
        justifyContent: 'center',
    },
    label: {
        fontSize: 13,
        color: 'rgba(0,0,0,0.8)',
        textTransform: 'uppercase',
        letterSpacing: 1,
        marginBottom: 4,
        fontWeight: '500',
    },
    labelSmall: {
        fontSize: 11,
        color: 'rgba(0,0,0,0.7)',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 2,
        fontWeight: '500',
    },
    balanceValue: {
        fontSize: 36,
        color: '#1e293b',
        fontWeight: '700',
        letterSpacing: -1,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
    },
    statValue: {
        fontSize: 20,
        color: '#1e293b',
        fontWeight: '600',
    },
    statValueDim: {
        fontSize: 24,
        color: 'rgba(0,0,0,0.5)',
        fontWeight: '700',
    },
    // Back styles
    topRowBack: {
        alignItems: 'flex-end',
    },
    copyButton: {
        backgroundColor: 'rgba(0,0,0,0.08)',
        padding: 8,
        borderRadius: 8,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    copyButtonDisabled: {
        opacity: 0.6,
    },
    copiedText: {
        color: '#4ade80',
        fontSize: 12,
        fontWeight: '600',
    },
    actionRow: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 12,
    },
    actionButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#1e293b',
        paddingVertical: 12,
        borderRadius: 12,
        gap: 8,
    },
    withdrawButton: {
        backgroundColor: '#FFFFFF',
        borderWidth: 1,
        borderColor: 'rgba(0,0,0,0.2)',
    },
    actionText: {
        color: '#FFF',
        fontSize: 14,
        fontWeight: '700',
    },
    withdrawButtonText: {
        color: '#1e293b',
    },
    tapBackText: {
        textAlign: 'center',
        fontSize: 10,
        color: 'rgba(0,0,0,0.4)',
    },
});
