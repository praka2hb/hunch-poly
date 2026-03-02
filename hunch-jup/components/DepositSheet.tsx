import { api, BridgeDepositResponse, BridgeSupportedAsset } from "@/lib/api";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Modal,
    PanResponder,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import QRCodeStyled from "react-native-qrcode-styled";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Theme ──
const SHEET_BG = "#e8d723";
const SURFACE_BG = "rgba(0,0,0,0.06)";
const SURFACE_BORDER = "rgba(0,0,0,0.14)";
const TEXT_PRIMARY = "#11181C";
const TEXT_DIM = "rgba(0,0,0,0.62)";
const TEXT_MUTED = "rgba(0,0,0,0.45)";
// Chain display config
type ChainKey = "evm" | "svm" | "tron" | "btc";
const CHAINS: { key: ChainKey; icon: keyof typeof Ionicons.glyphMap; label: string; shortLabel: string; color: string }[] = [
    { key: "evm", icon: "cube-outline", label: "EVM", shortLabel: "EVM", color: "#627EEA" },
    { key: "svm", icon: "flash-outline", label: "Solana", shortLabel: "SOL", color: "#9945FF" },
    { key: "tron", icon: "globe-outline", label: "Tron", shortLabel: "TRX", color: "#FF0013" },
    { key: "btc", icon: "logo-bitcoin", label: "Bitcoin", shortLabel: "BTC", color: "#F7931A" },
];

type SheetView = "choose" | "crosschain";

interface DepositSheetProps {
    visible: boolean;
    onClose: () => void;
    walletAddress?: string;
    /** Called when user picks "Debit Card" — opens Privy fund UI */
    onDebitCard: () => void;
}

export default function DepositSheet({
    visible,
    onClose,
    walletAddress,
    onDebitCard,
}: DepositSheetProps) {
    const insets = useSafeAreaInsets();
    const screenH = Dimensions.get("window").height;

    const [view, setView] = useState<SheetView>("choose");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [depositAddresses, setDepositAddresses] = useState<BridgeDepositResponse | null>(null);
    const [supportedAssets, setSupportedAssets] = useState<BridgeSupportedAsset[]>([]);
    const [selectedChain, setSelectedChain] = useState<ChainKey>("evm");
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [assetSearch, setAssetSearch] = useState("");

    // ── Active address for selected chain ──
    const activeAddress = depositAddresses?.address?.[selectedChain] ?? "";

    // ── Filtered assets for the search ──
    const filteredAssets = useMemo(() => {
        if (!assetSearch.trim()) return [];
        const q = assetSearch.toLowerCase();
        return supportedAssets.filter(
            (a) =>
                a.token.symbol.toLowerCase().includes(q) ||
                a.token.name.toLowerCase().includes(q) ||
                a.chainName.toLowerCase().includes(q)
        );
    }, [assetSearch, supportedAssets]);

    // ── Available chains (only those with an address) ──
    const availableChains = useMemo(
        () => CHAINS.filter((c) => depositAddresses?.address?.[c.key]),
        [depositAddresses]
    );

    // ── Animation ──
    const slideAnim = useRef(new Animated.Value(screenH)).current;

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

    useEffect(() => {
        if (visible) {
            setView("choose");
            setError(null);
            setCopiedKey(null);
            setAssetSearch("");
            setSelectedChain("evm");
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
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        Animated.timing(slideAnim, {
            toValue: screenH,
            duration: 200,
            useNativeDriver: true,
        }).start(() => onClose());
    }, [onClose, screenH, slideAnim]);

    const handleDebitCard = useCallback(() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        handleClose();
        setTimeout(() => onDebitCard(), 250);
    }, [onDebitCard, handleClose]);

    const handleCrossChain = useCallback(async () => {
        if (!walletAddress) {
            setError("Wallet address not available");
            return;
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        setView("crosschain");
        setLoading(true);
        setError(null);

        try {
            const [assetsResp, depositResp] = await Promise.all([
                api.getBridgeSupportedAssets(),
                api.createBridgeDepositAddresses(walletAddress),
            ]);
            setSupportedAssets(assetsResp.supportedAssets || []);
            setDepositAddresses(depositResp);
        } catch (err: any) {
            console.error("[DepositSheet] Bridge error:", err);
            setError(err?.message || "Failed to load deposit addresses");
        } finally {
            setLoading(false);
        }
    }, [walletAddress]);

    const copyAddress = async (key: string, address: string) => {
        await Clipboard.setStringAsync(address);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
    };

    const shortenAddress = (addr: string) =>
        addr.length > 16 ? `${addr.slice(0, 10)}…${addr.slice(-8)}` : addr;

    if (!visible) return null;

    // ── Choose view: compact bottom sheet ──
    if (view === "choose") {
        return (
            <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
                <View style={styles.overlay}>
                    <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
                    <Animated.View
                        style={[
                            styles.sheetCompact,
                            { paddingBottom: Math.max(insets.bottom, 24), transform: [{ translateY: slideAnim }] },
                        ]}
                    >
                        <View {...panResponder.panHandlers} style={styles.handleZone}>
                            <View style={styles.handle} />
                        </View>
                        <View style={styles.content}>
                            <Text style={styles.title}>Add Funds</Text>
                            <Text style={styles.subtitle}>Choose how you'd like to deposit</Text>

                            <TouchableOpacity style={styles.optionCard} activeOpacity={0.75} onPress={handleCrossChain}>
                                <View style={[styles.optionIcon, { backgroundColor: "rgba(153,69,255,0.12)" }]}>
                                    <Ionicons name="swap-horizontal" size={24} color="#9945FF" />
                                </View>
                                <View style={styles.optionText}>
                                    <Text style={styles.optionTitle}>Cross-Chain Deposit</Text>
                                    <Text style={styles.optionDesc}>
                                        Send crypto from Ethereum, Solana, Base, Bitcoin or other chains
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
                            </TouchableOpacity>

                            <TouchableOpacity style={styles.optionCard} activeOpacity={0.75} onPress={handleDebitCard}>
                                <View style={[styles.optionIcon, { backgroundColor: "rgba(16,185,129,0.12)" }]}>
                                    <Ionicons name="card" size={24} color="#10b981" />
                                </View>
                                <View style={styles.optionText}>
                                    <Text style={styles.optionTitle}>Debit Card</Text>
                                    <Text style={styles.optionDesc}>Buy USDC instantly with your debit card</Text>
                                </View>
                                <Ionicons name="chevron-forward" size={20} color={TEXT_MUTED} />
                            </TouchableOpacity>
                        </View>
                    </Animated.View>
                </View>
            </Modal>
        );
    }

    // ── Cross-chain view: near-full-screen sheet ──
    const isCopied = copiedKey === selectedChain;
    const chainMeta = CHAINS.find((c) => c.key === selectedChain) || CHAINS[0];

    return (
        <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose}>
            <View style={styles.overlay}>
                <TouchableOpacity style={styles.backdrop} activeOpacity={1} onPress={handleClose} />
                <Animated.View
                    style={[
                        styles.sheetFull,
                        {
                            paddingBottom: Math.max(insets.bottom, 16),
                            transform: [{ translateY: slideAnim }],
                        },
                    ]}
                >
                    {/* Drag handle */}
                    <View {...panResponder.panHandlers} style={styles.handleZone}>
                        <View style={styles.handle} />
                    </View>

                    {/* Header */}
                    <View style={styles.ccHeader}>
                        <TouchableOpacity
                            onPress={() => { setView("choose"); setError(null); setAssetSearch(""); }}
                            style={styles.backBtn}
                            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                        >
                            <Ionicons name="arrow-back" size={22} color={TEXT_PRIMARY} />
                        </TouchableOpacity>
                        <Text style={styles.ccTitle}>Deposit</Text>
                        <TouchableOpacity onPress={handleClose} style={styles.backBtn} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                            <Ionicons name="close" size={22} color={TEXT_PRIMARY} />
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <View style={styles.loadingContainer}>
                            <ActivityIndicator size="large" color={TEXT_PRIMARY} />
                            <Text style={[styles.subtitle, { marginTop: 12 }]}>Generating deposit addresses…</Text>
                        </View>
                    ) : error ? (
                        <View style={styles.errorContainer}>
                            <Ionicons name="alert-circle" size={36} color="#CC0000" />
                            <Text style={styles.errorText}>{error}</Text>
                            <TouchableOpacity style={styles.retryBtn} onPress={handleCrossChain}>
                                <Text style={styles.retryText}>Retry</Text>
                            </TouchableOpacity>
                        </View>
                    ) : depositAddresses ? (
                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            contentContainerStyle={styles.ccScrollContent}
                            keyboardShouldPersistTaps="handled"
                        >
                            {/* ── Chain selector tabs ── */}
                            <View style={styles.chainTabs}>
                                {availableChains.map((c) => {
                                    const active = c.key === selectedChain;
                                    return (
                                        <TouchableOpacity
                                            key={c.key}
                                            style={[styles.chainTab, active && styles.chainTabActive]}
                                            activeOpacity={0.7}
                                            onPress={() => {
                                                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                                                setSelectedChain(c.key);
                                                setCopiedKey(null);
                                            }}
                                        >
                                            <Ionicons name={c.icon} size={16} color={active ? "#fff" : TEXT_DIM} />
                                            <Text style={[styles.chainTabLabel, active && styles.chainTabLabelActive]}>
                                                {c.shortLabel}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            {/* ── QR Code ── */}
                            {activeAddress ? (
                                <View style={styles.qrContainer}>
                                    <View style={styles.qrCard}>
                                        <QRCodeStyled
                                            data={activeAddress}
                                            style={styles.qrCode}
                                            padding={16}
                                            size={200}
                                            color={TEXT_PRIMARY}
                                            pieceCornerType="rounded"
                                            pieceBorderRadius={2}
                                            isPiecesGlued
                                        />
                                    </View>
                                    <Text style={styles.chainNameLabel}>
                                        <Ionicons name={chainMeta.icon} size={14} color={chainMeta.color} />
                                        {"  "}
                                        {chainMeta.label}
                                    </Text>
                                </View>
                            ) : null}

                            {/* ── Address + Copy ── */}
                            {activeAddress ? (
                                <TouchableOpacity
                                    style={styles.addressCard}
                                    activeOpacity={0.7}
                                    onPress={() => copyAddress(selectedChain, activeAddress)}
                                >
                                    <Text style={styles.addressLabel}>Deposit Address</Text>
                                    <View style={styles.addressRow}>
                                        <Text style={styles.addressText} numberOfLines={1} ellipsizeMode="middle">
                                            {shortenAddress(activeAddress)}
                                        </Text>
                                        <View style={[styles.copyPill, isCopied && styles.copyPillActive]}>
                                            {isCopied ? (
                                                <Ionicons name="checkmark" size={14} color="#10b981" />
                                            ) : (
                                                <Ionicons name="copy-outline" size={14} color={TEXT_DIM} />
                                            )}
                                            <Text style={[styles.copyLabel, isCopied && { color: "#10b981" }]}>
                                                {isCopied ? "Copied" : "Copy"}
                                            </Text>
                                        </View>
                                    </View>
                                </TouchableOpacity>
                            ) : null}

                            {/* ── Info note ── */}
                            <View style={styles.infoBox}>
                                <Ionicons name="information-circle-outline" size={16} color={TEXT_DIM} style={{ marginTop: 1 }} />
                                <Text style={styles.infoText}>
                                    Send supported tokens to this address. Funds are automatically bridged to USDC on Polygon.
                                </Text>
                            </View>

                            {/* ── Searchable supported assets ── */}
                            <View style={styles.searchSection}>
                                <Text style={styles.searchLabel}>Search Supported Tokens</Text>
                                <View style={styles.searchBox}>
                                    <Ionicons name="search" size={16} color={TEXT_MUTED} />
                                    <TextInput
                                        style={styles.searchInput}
                                        placeholder="e.g. USDC, ETH, SOL…"
                                        placeholderTextColor={TEXT_MUTED}
                                        value={assetSearch}
                                        onChangeText={setAssetSearch}
                                        autoCapitalize="none"
                                        autoCorrect={false}
                                    />
                                    {assetSearch.length > 0 && (
                                        <TouchableOpacity onPress={() => setAssetSearch("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                            <Ionicons name="close-circle" size={16} color={TEXT_MUTED} />
                                        </TouchableOpacity>
                                    )}
                                </View>

                                {assetSearch.trim().length > 0 && (
                                    filteredAssets.length > 0 ? (
                                        <View style={styles.searchResults}>
                                            {filteredAssets.slice(0, 20).map((asset, i) => (
                                                <View key={`${asset.chainId}-${asset.token.symbol}-${i}`} style={styles.assetRow}>
                                                    <View style={styles.assetInfo}>
                                                        <Text style={styles.assetSymbol}>{asset.token.symbol}</Text>
                                                        <Text style={styles.assetName}>{asset.token.name}</Text>
                                                    </View>
                                                    <View style={styles.assetMeta}>
                                                        <Text style={styles.assetChain}>{asset.chainName}</Text>
                                                        <Text style={styles.assetMin}>min ${asset.minCheckoutUsd}</Text>
                                                    </View>
                                                </View>
                                            ))}
                                        </View>
                                    ) : (
                                        <Text style={styles.noResults}>No matching tokens found</Text>
                                    )
                                )}
                            </View>

                            {depositAddresses.note ? (
                                <Text style={styles.noteText}>{depositAddresses.note}</Text>
                            ) : null}
                        </ScrollView>
                    ) : null}
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: "flex-end",
        backgroundColor: "rgba(0,0,0,0.5)",
    },
    backdrop: {
        ...StyleSheet.absoluteFillObject,
    },

    /* ── Compact sheet (choose view) ── */
    sheetCompact: {
        backgroundColor: SHEET_BG,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        minHeight: 260,
    },

    /* ── Full-height sheet (cross-chain view) ── */
    sheetFull: {
        height: "86%",
        backgroundColor: SHEET_BG,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        marginTop: "auto",
        overflow: "hidden",
    },

    handleZone: {
        alignItems: "center",
        paddingTop: 12,
        paddingBottom: 4,
    },
    handle: {
        width: 40,
        height: 5,
        borderRadius: 3,
        backgroundColor: "rgba(0,0,0,0.18)",
    },
    content: {
        paddingHorizontal: 24,
        paddingTop: 8,
        paddingBottom: 16,
    },
    title: {
        fontSize: 22,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        textAlign: "center",
        marginBottom: 4,
    },
    subtitle: {
        fontSize: 14,
        color: TEXT_DIM,
        textAlign: "center",
        marginBottom: 24,
    },

    // ── Option cards ──
    optionCard: {
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: SURFACE_BG,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
        borderRadius: 16,
        padding: 16,
        marginBottom: 12,
    },
    optionIcon: {
        width: 48,
        height: 48,
        borderRadius: 14,
        alignItems: "center",
        justifyContent: "center",
        marginRight: 14,
    },
    optionText: {
        flex: 1,
    },
    optionTitle: {
        fontSize: 16,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        marginBottom: 3,
    },
    optionDesc: {
        fontSize: 13,
        color: TEXT_DIM,
        lineHeight: 17,
    },

    // ── Cross-chain header ──
    ccHeader: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 20,
        paddingBottom: 8,
    },
    ccTitle: {
        fontSize: 18,
        fontWeight: "700",
        color: TEXT_PRIMARY,
    },
    backBtn: {
        width: 34,
        height: 34,
        borderRadius: 12,
        backgroundColor: SURFACE_BG,
        alignItems: "center",
        justifyContent: "center",
    },
    ccScrollContent: {
        paddingHorizontal: 24,
        paddingTop: 4,
        paddingBottom: 24,
    },

    // ── Chain tabs ──
    chainTabs: {
        flexDirection: "row",
        gap: 8,
        marginBottom: 24,
        justifyContent: "center",
    },
    chainTab: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        paddingHorizontal: 16,
        paddingVertical: 10,
        borderRadius: 12,
        backgroundColor: SURFACE_BG,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
    },
    chainTabActive: {
        backgroundColor: TEXT_PRIMARY,
        borderColor: TEXT_PRIMARY,
    },
    chainTabLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: TEXT_DIM,
    },
    chainTabLabelActive: {
        color: "#fff",
    },

    // ── QR Code ──
    qrContainer: {
        alignItems: "center",
        marginBottom: 20,
    },
    qrCard: {
        backgroundColor: "#fff",
        borderRadius: 20,
        padding: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 12,
        elevation: 4,
    },
    qrCode: {
        backgroundColor: "#fff",
    },
    chainNameLabel: {
        marginTop: 12,
        fontSize: 14,
        fontWeight: "600",
        color: TEXT_DIM,
    },

    // ── Address card ──
    addressCard: {
        backgroundColor: SURFACE_BG,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
        borderRadius: 14,
        padding: 14,
        marginBottom: 12,
    },
    addressLabel: {
        fontSize: 11,
        fontWeight: "600",
        color: TEXT_MUTED,
        textTransform: "uppercase",
        letterSpacing: 0.6,
        marginBottom: 8,
    },
    addressRow: {
        flexDirection: "row",
        alignItems: "center",
    },
    addressText: {
        flex: 1,
        fontSize: 13,
        fontWeight: "500",
        color: TEXT_PRIMARY,
        fontFamily: "monospace",
    },
    copyPill: {
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        backgroundColor: "rgba(0,0,0,0.06)",
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        marginLeft: 8,
    },
    copyPillActive: {
        backgroundColor: "rgba(16,185,129,0.12)",
    },
    copyLabel: {
        fontSize: 12,
        fontWeight: "600",
        color: TEXT_DIM,
    },

    // ── Info box ──
    infoBox: {
        flexDirection: "row",
        gap: 8,
        backgroundColor: "rgba(0,0,0,0.04)",
        borderRadius: 12,
        padding: 12,
        marginBottom: 20,
    },
    infoText: {
        flex: 1,
        fontSize: 12,
        color: TEXT_DIM,
        lineHeight: 17,
    },

    // ── Search ──
    searchSection: {
        marginBottom: 16,
    },
    searchLabel: {
        fontSize: 13,
        fontWeight: "700",
        color: TEXT_PRIMARY,
        marginBottom: 8,
    },
    searchBox: {
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        backgroundColor: SURFACE_BG,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
        borderRadius: 12,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    searchInput: {
        flex: 1,
        fontSize: 14,
        color: TEXT_PRIMARY,
        padding: 0,
    },
    searchResults: {
        marginTop: 8,
        backgroundColor: SURFACE_BG,
        borderWidth: 1,
        borderColor: SURFACE_BORDER,
        borderRadius: 12,
        overflow: "hidden",
    },
    assetRow: {
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        paddingHorizontal: 14,
        paddingVertical: 11,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: SURFACE_BORDER,
    },
    assetInfo: {
        flex: 1,
    },
    assetSymbol: {
        fontSize: 14,
        fontWeight: "700",
        color: TEXT_PRIMARY,
    },
    assetName: {
        fontSize: 11,
        color: TEXT_MUTED,
        marginTop: 1,
    },
    assetMeta: {
        alignItems: "flex-end",
    },
    assetChain: {
        fontSize: 12,
        fontWeight: "600",
        color: TEXT_DIM,
    },
    assetMin: {
        fontSize: 11,
        color: TEXT_MUTED,
        marginTop: 1,
    },
    noResults: {
        marginTop: 12,
        fontSize: 13,
        color: TEXT_MUTED,
        textAlign: "center",
    },

    // ── Loading / Error / Misc ──
    loadingContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 48,
    },
    errorContainer: {
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        paddingVertical: 32,
        gap: 12,
    },
    errorText: {
        color: "#CC0000",
        fontSize: 14,
        textAlign: "center",
        fontWeight: "500",
    },
    retryBtn: {
        paddingHorizontal: 24,
        paddingVertical: 10,
        backgroundColor: TEXT_PRIMARY,
        borderRadius: 10,
    },
    retryText: {
        color: "#fff",
        fontWeight: "700",
        fontSize: 14,
    },
    noteText: {
        fontSize: 12,
        color: TEXT_MUTED,
        textAlign: "center",
        marginTop: 4,
        marginBottom: 8,
        lineHeight: 17,
    },
});
