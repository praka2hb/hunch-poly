import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    PanResponder,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Theme constants (same as WithdrawSheet) ──
const YELLOW = "#e8d723";
const SHEET_BG = "#e8d723";
const SURFACE_BG = "rgba(0,0,0,0.06)";
const SURFACE_BORDER = "rgba(0,0,0,0.14)";
const TEXT_PRIMARY = "#11181C";
const TEXT_DIM = "rgba(0,0,0,0.62)";
const TEXT_MUTED = "rgba(0,0,0,0.45)";

type SendPayload = { toAddress: string; amount: number };

// ─────────────────────────────────────────────────────────
// SendSheet — Single-step (amount only) when recipientAddress
// is provided; otherwise falls back to two-step like WithdrawSheet.
// ─────────────────────────────────────────────────────────
export default function SendSheet({
    visible,
    onClose,
    onSubmit,
    submitting = false,
    balance = 0,
    recipientAddress,
    recipientName,
}: {
    visible: boolean;
    onClose: () => void;
    onSubmit: (payload: SendPayload) => Promise<void> | void;
    submitting?: boolean;
    balance?: number;
    /** Pre-filled recipient wallet address. If set, Step 2 is skipped. */
    recipientAddress?: string;
    /** Display name of the recipient (shown in header) */
    recipientName?: string;
}) {
    const insets = useSafeAreaInsets();
    const screenH = Dimensions.get("window").height;

    const [amount, setAmount] = useState("");

    // ── Animation ──
    const slideAnim = useRef(new Animated.Value(screenH)).current;

    // ── Pan responder for drag-to-close ──
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 8,
            onPanResponderMove: (_, g) => {
                if (g.dy > 0) slideAnim.setValue(g.dy);
            },
            onPanResponderRelease: (_, g) => {
                if (g.dy > 140) {
                    handleClose();
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

    // ── Lifecycle ──
    useEffect(() => {
        if (visible) {
            setAmount("");
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                damping: 28,
                stiffness: 400,
                mass: 0.8,
            }).start();
        } else {
            slideAnim.setValue(screenH);
        }
    }, [visible]);

    const handleClose = useCallback(() => {
        Animated.timing(slideAnim, {
            toValue: screenH,
            duration: 250,
            useNativeDriver: true,
        }).start(() => onClose());
    }, [screenH, onClose]);

    // ── Amount logic ──
    const amountValue = useMemo(() => {
        const v = Number(amount);
        return Number.isFinite(v) ? v : 0;
    }, [amount]);

    const appendDigit = (digit: string) => {
        let next = amount || "";
        if (next === "0" && digit !== ".") next = "";
        if (digit === "." && next.includes(".")) return;
        next = `${next}${digit}`;
        if (next.includes(".")) {
            const [, decimals = ""] = next.split(".");
            if (decimals.length > 6) return;
        }
        setAmount(next);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const backspace = () => {
        if (!amount) return;
        setAmount(amount.length === 1 ? "" : amount.slice(0, -1));
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const setPercentage = (pct: number) => {
        const val = balance * pct;
        if (val <= 0) return;
        setAmount(
            val % 1 === 0
                ? val.toString()
                : val
                    .toFixed(6)
                    .replace(/0+$/, "")
                    .replace(/\.$/, "")
        );
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    };

    const canSend = amountValue > 0 && amountValue <= balance && !submitting;

    const handleSubmit = async () => {
        if (!canSend) return;
        const toAddress = recipientAddress || "";
        if (!toAddress) return;
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await onSubmit({ toAddress, amount: amountValue });
    };

    return (
        <Modal
            visible={visible}
            transparent
            animationType="none"
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <View style={[StyleSheet.absoluteFill, styles.backdrop]}>
                <Animated.View
                    style={[
                        styles.container,
                        {
                            paddingTop: Math.max(insets.top - 28, 4),
                            paddingBottom: insets.bottom,
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* ── Drag handle ── */}
                    <View style={styles.handleArea} {...panResponder.panHandlers}>
                        <View style={styles.dragHandle} />
                    </View>

                    {/* ── Top bar ── */}
                    <View style={styles.topBar}>
                        <View style={{ width: 36 }} />
                        <View style={styles.topBarCenter}>
                           {recipientName && (
                                <Text style={styles.topBarSub}>to {recipientName}</Text>
                            )}
                        </View>
                        <TouchableOpacity
                            onPress={handleClose}
                            style={styles.iconBtn}
                            activeOpacity={0.7}
                        >
                            <Ionicons name="close" size={20} color={TEXT_PRIMARY} />
                        </TouchableOpacity>
                    </View>

                    {/* ── Amount display ── */}
                    <View style={styles.amountArea}>
                        <Text
                            style={styles.bigAmount}
                            numberOfLines={1}
                            adjustsFontSizeToFit
                        >
                            {amount || "0"}
                        </Text>

                     

                        {/* Balance pill (right-aligned) */}
                        <View style={{ alignSelf: "flex-end", marginRight: 24 }}>
                            <View style={styles.balancePill}>
                                <Ionicons name="wallet-outline" size={20} color={TEXT_DIM} />
                                <Text style={styles.balanceText}>{balance.toFixed(1)} USDC</Text>
                            </View>
                        </View>

                        {/* Insufficient warning */}
                        {amountValue > balance && amount !== "" && (
                            <Text style={styles.warningText}>Insufficient balance</Text>
                        )}
                    </View>

                    {/* ── CTA + Keypad ── */}
                    <View style={styles.keypadSection}>
                        {/* Summary row */}
                        {/* {amountValue > 0 && (
                            <View style={styles.summaryRow}>
                                <Text style={styles.summaryLabel}>Sending</Text>
                                <Text style={styles.summaryValue}>
                                    {amountValue.toFixed(6)} USDC
                                </Text>
                            </View>
                        )} */}

                        {/* Quick amount actions */}
                        <View style={styles.quickRow}>
                            {[
                                { label: "MAX", pct: 1 },
                                { label: "75%", pct: 0.75 },
                                { label: "50%", pct: 0.5 },
                                { label: "CLEAR", pct: 0 },
                            ].map((btn) => (
                                <TouchableOpacity
                                    key={btn.label}
                                    style={styles.specialKey}
                                    onPress={() =>
                                        btn.label === "CLEAR"
                                            ? setAmount("")
                                            : setPercentage(btn.pct)
                                    }
                                    activeOpacity={0.7}
                                >
                                    <Text style={styles.specialKeyText}>{btn.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* Keypad */}
                        <View style={styles.keypadGrid}>
                            {[
                                ["1", "2", "3"],
                                ["4", "5", "6"],
                                ["7", "8", "9"],
                                [".", "0", "⌫"],
                            ].map((row, ri) => (
                                <View key={ri} style={styles.keyRow}>
                                    {row.map((d) => (
                                        <TouchableOpacity
                                            key={d}
                                            style={styles.numKey}
                                            onPress={() => (d === "⌫" ? backspace() : appendDigit(d))}
                                            activeOpacity={0.6}
                                        >
                                            {d === "⌫" ? (
                                                <Ionicons
                                                    name="backspace-outline"
                                                    size={22}
                                                    color={TEXT_PRIMARY}
                                                />
                                            ) : (
                                                <Text style={styles.numKeyText}>{d}</Text>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            ))}
                        </View>

                        {/* Send Button (bottom - slide-style pill) */}
                        <TouchableOpacity
                            activeOpacity={0.85}
                            disabled={!canSend}
                            onPress={handleSubmit}
                            style={{ marginTop: 14 }}
                        >
                            <View style={[styles.ctaButton, !canSend && { opacity: 0.8 }]}>
                                <View style={styles.ctaThumb}>
                                    <Ionicons
                                        name="arrow-forward"
                                        size={16}
                                        color="#FFFFFF"
                                    />
                                </View>
                                {submitting ? (
                                    <ActivityIndicator size="small" color="#FFFFFF" />
                                ) : (
                                    <Text
                                        style={[
                                            styles.ctaText,
                                            !canSend && styles.ctaTextDisabled,
                                        ]}
                                    >
                                        {amountValue <= 0
                                            ? "Enter amount"
                                            : amountValue > balance
                                                ? "Insufficient balance"
                                                : `Send to ${recipientName || "User"}`}
                                    </Text>
                                )}
                            </View>
                        </TouchableOpacity>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ── Styles ──
const styles = StyleSheet.create({
    backdrop: {
        backgroundColor: "rgba(0,0,0,0.6)",
    },
    container: {
        height: "82%",
        backgroundColor: SHEET_BG,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: "auto",
        overflow: "hidden",
    },
    handleArea: {
        alignItems: "center",
        paddingTop: 2,
        paddingBottom: 2,
    },
    dragHandle: {
        width: 60,
        height: 4,
        borderRadius: 2,
        backgroundColor: "#47430e",
    },

    // ── Top bar ──
    topBar: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingVertical: 8,
    },
    topBarCenter: {
        alignItems: "center",
    },
    topBarTitle: {
        fontSize: 17,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        letterSpacing: 0.3,
    },
    topBarSub: {
        fontSize: 20,
        color: TEXT_PRIMARY,
        fontWeight: "700",
        marginTop: 1,
    },
    iconBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        backgroundColor: "rgba(0,0,0,0.08)",
        justifyContent: "center",
        alignItems: "center",
    },

    // ── Amount area ──
    amountArea: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: 8,
    },
    bigAmount: {
        fontSize: 64,
        fontWeight: "800",
        color: TEXT_PRIMARY,
        letterSpacing: -2,
        lineHeight: 72,
        marginBottom: 6,
        paddingHorizontal: 32,
        textAlign: "center",
    },
    dollarRow: {
        flexDirection: "row",
        alignItems: "center",
        marginBottom: 16,
    },
    dollarText: {
        fontSize: 15,
        color: TEXT_DIM,
        fontWeight: "500",
    },
    balancePill: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: SURFACE_BG,
        borderRadius: 16,
        paddingHorizontal: 14,
        paddingVertical: 4,
        gap: 8,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
    },
    balanceText: {
        fontSize: 12,
        color: TEXT_DIM,
        fontWeight: "600",
    },
    warningText: {
        color: "#FF10F0",
        fontSize: 13,
        fontWeight: "600",
        marginTop: 12,
    },

    // ── Keypad section ──
    keypadSection: {
        paddingHorizontal: 16,
        paddingBottom: 8,
    },
    summaryRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
        paddingHorizontal: 4,
    },
    summaryLabel: {
        fontSize: 14,
        color: TEXT_DIM,
        fontWeight: "500",
    },
    summaryValue: {
        fontSize: 14,
        color: TEXT_PRIMARY,
        fontWeight: "700",
    },
    ctaButton: {
        height: 56,
        borderRadius: 14,
        backgroundColor: "#E5E7EB",
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 8,
    },
    ctaText: {
        fontSize: 16,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        letterSpacing: 0.3,
        flex: 1,
        textAlign: "center",
    },
    ctaTextDisabled: {
        color: "rgba(17,24,28,0.55)",
    },
    ctaThumb: {
        width: 34,
        height: 34,
        borderRadius: 10,
        backgroundColor: "#111827",
        justifyContent: "center",
        alignItems: "center",
    },
    keypadGrid: {
        gap: 6,
        marginTop: 8,
    },
    keyRow: {
        flexDirection: "row",
        gap: 6,
    },
    numKey: {
        flex: 1,
        height: 54,
        borderRadius: 14,
        justifyContent: "center",
        alignItems: "center",
    },
    numKeyText: {
        fontSize: 24,
        fontWeight: "600",
        color: TEXT_PRIMARY,
    },
    specialKey: {
        flex: 1,
        height: 38,
        borderRadius: 999,
        backgroundColor: SURFACE_BG,
        justifyContent: "center",
        alignItems: "center",
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
        marginHorizontal: 4,
    },
    specialKeyText: {
        fontSize: 12,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        letterSpacing: 0.5,
    },
    quickRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 10,
        marginTop: 2,
        paddingHorizontal: 4,
    },
});
