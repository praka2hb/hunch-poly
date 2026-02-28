import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Theme constants ──
const YELLOW = "#e8d723";
const YELLOW_LIGHT = "#FFE500";
const SHEET_BG = "#e8d723";
const SURFACE_BG = "rgba(0,0,0,0.06)";
const SURFACE_BORDER = "rgba(0,0,0,0.14)";
const TEXT_PRIMARY = "#11181C";
const TEXT_DIM = "rgba(0,0,0,0.62)";
const TEXT_MUTED = "rgba(0,0,0,0.45)";

const STORAGE_KEY = "hunch_recent_wallets";
const MAX_RECENT = 10;

// ── Types ──
type WithdrawPayload = { toAddress: string; amount: number };

type SavedWallet = {
  address: string;
  label?: string;
  emoji?: string;
  lastUsed: number;
};

// ── Helpers ──
const WALLET_EMOJIS = ["🦊", "🐸", "🦁", "🐳", "🦅", "🐼", "🐨", "🦉", "🐙", "🦋", "🌟", "🔥", "💎", "🚀", "⚡"];
const WALLET_COLORS = ["#6366f1", "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#ec4899", "#14b8a6", "#f97316"];

const randomEmoji = () => WALLET_EMOJIS[Math.floor(Math.random() * WALLET_EMOJIS.length)];
const colorForAddress = (addr: string) => {
  let hash = 0;
  for (let i = 0; i < addr.length; i++) hash = (hash << 5) - hash + addr.charCodeAt(i);
  return WALLET_COLORS[Math.abs(hash) % WALLET_COLORS.length];
};
const shortenAddress = (addr: string) =>
  addr.length > 12 ? `${addr.slice(0, 4)}...${addr.slice(-4)}` : addr;

// ────────────────────────────────────────────
// WithdrawSheet — Two-step full-screen flow
// ────────────────────────────────────────────
export default function WithdrawSheet({
  visible,
  onClose,
  onSubmit,
  submitting = false,
  balance = 0,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (payload: WithdrawPayload) => Promise<void> | void;
  submitting?: boolean;
  balance?: number;
}) {
  const insets = useSafeAreaInsets();
  const screenH = Dimensions.get("window").height;
  const screenW = Dimensions.get("window").width;

  // ── State ──
  const [step, setStep] = useState<1 | 2>(1);
  const [amount, setAmount] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [addressTab, setAddressTab] = useState<"book" | "recent">("recent");
  const [recentWallets, setRecentWallets] = useState<SavedWallet[]>([]);
  const [addressBookWallets, setAddressBookWallets] = useState<SavedWallet[]>([]);

  // ── Animation ──
  const slideAnim = useRef(new Animated.Value(screenH)).current;
  const stepAnim = useRef(new Animated.Value(0)).current;

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
          Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 30, stiffness: 500, mass: 0.8 }).start();
        }
      },
    })
  ).current;

  // ── AsyncStorage helpers ──
  const loadWallets = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: SavedWallet[] = JSON.parse(raw);
        const sorted = parsed.sort((a, b) => b.lastUsed - a.lastUsed);
        setRecentWallets(sorted);
        setAddressBookWallets(sorted.filter((w) => w.label));
      } else {
        setRecentWallets([]);
        setAddressBookWallets([]);
      }
    } catch {}
  }, []);

  const saveWalletToRecent = useCallback(async (address: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      let wallets: SavedWallet[] = raw ? JSON.parse(raw) : [];
      const idx = wallets.findIndex((w) => w.address === address);
      if (idx >= 0) {
        wallets[idx].lastUsed = Date.now();
      } else {
        wallets.push({ address, emoji: randomEmoji(), lastUsed: Date.now() });
      }
      wallets = wallets.sort((a, b) => b.lastUsed - a.lastUsed).slice(0, MAX_RECENT);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(wallets));
    } catch {}
  }, []);

  // ── Lifecycle ──
  useEffect(() => {
    if (visible) {
      setStep(1);
      setAmount("");
      setToAddress("");
      setAddressTab("recent");
      stepAnim.setValue(0);
      loadWallets();
      Animated.spring(slideAnim, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 400, mass: 0.8 }).start();
    } else {
      slideAnim.setValue(screenH);
    }
  }, [visible]);

  const handleClose = () => {
    Animated.timing(slideAnim, { toValue: screenH, duration: 250, useNativeDriver: true }).start(() => onClose());
  };

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
    setAmount(val % 1 === 0 ? val.toString() : val.toFixed(6).replace(/0+$/, "").replace(/\.$/, ""));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // ── Navigation ──
  const goToStep2 = () => {
    if (amountValue <= 0 || amountValue > balance) return;
    setStep(2);
    Animated.spring(stepAnim, { toValue: 1, useNativeDriver: true, damping: 28, stiffness: 400, mass: 0.8 }).start();
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const goBackToStep1 = () => {
    setStep(1);
    Animated.spring(stepAnim, { toValue: 0, useNativeDriver: true, damping: 28, stiffness: 400, mass: 0.8 }).start();
  };

  // ── Submit ──
  const handleSubmit = async () => {
    if (!toAddress.trim() || toAddress.trim().length < 10 || amountValue <= 0) return;
    await saveWalletToRecent(toAddress.trim());
    await onSubmit({ toAddress: toAddress.trim(), amount: amountValue });
  };

  // ── Paste from clipboard ──
  const pasteAddress = async () => {
    try {
      const text = await Clipboard.getStringAsync();
      if (text) {
        setToAddress(text.trim());
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {}
  };

  const canContinue = amountValue > 0 && amountValue <= balance;
  const canSubmit = toAddress.trim().length >= 10 && canContinue && !submitting;

  // ── Step slide animations ──
  const step1TranslateX = stepAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -screenW] });
  const step2TranslateX = stepAnim.interpolate({ inputRange: [0, 1], outputRange: [screenW, 0] });

  const displayWallets = addressTab === "book" ? addressBookWallets : recentWallets;

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={handleClose} statusBarTranslucent>
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

          {/* ── Content ── */}
          <View style={styles.content}>
            {/* ═══════════════════════════════════════ */}
            {/* STEP 1 — Amount Entry                  */}
            {/* ═══════════════════════════════════════ */}
            <Animated.View
              style={[styles.stepContainer, { transform: [{ translateX: step1TranslateX }] }]}
              pointerEvents={step === 1 ? "auto" : "none"}
            >
              {/* Top bar */}
              <View style={styles.topBar}>
                <View style={{ width: 36 }} />
                <Text style={styles.topBarTitle}>Withdraw</Text>
                <TouchableOpacity onPress={handleClose} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={20} color={TEXT_PRIMARY} />
                </TouchableOpacity>
              </View>

              {/* Amount display */}
              <View style={styles.amountArea}>

                {/* Big amount */}
                <Text
                  style={styles.bigAmount}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                >
                  {amount || "0"}
                </Text>

                {/* Dollar equivalent */}
                <View style={styles.dollarRow}>
                  <Text style={styles.dollarText}>${amountValue.toFixed(2)}</Text>
                  <Ionicons name="swap-horizontal" size={14} color={TEXT_DIM} style={{ marginLeft: 6 }} />
                </View>

                {/* Balance pill */}
                <View style={styles.balancePill}>
                  <Ionicons name="wallet-outline" size={14} color={TEXT_DIM} />
                  <Text style={styles.balanceText}>{balance.toFixed(6)} USDC</Text>
                </View>

                {/* Insufficient warning */}
                {amountValue > balance && amount !== "" && (
                  <Text style={styles.warningText}>Insufficient balance</Text>
                )}
              </View>

              {/* CTA + Keypad */}
              <View style={styles.keypadSection}>
                {/* Continue Button */}
                <TouchableOpacity activeOpacity={0.85} disabled={!canContinue} onPress={goToStep2} style={{ marginBottom: 14 }}>
                  <LinearGradient
                    colors={canContinue ? ["#000000", "#1A1A1A"] : ["#D1D5DB", "#E5E7EB"]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.ctaButton}
                  >
                    <Text style={[styles.ctaText, !canContinue && styles.ctaTextDisabled]}>Continue</Text>
                  </LinearGradient>
                </TouchableOpacity>

                {/* Keypad */}
                <View style={styles.keypadGrid}>
                  {[
                    { special: "MAX", pct: 1, digits: ["1", "2", "3"] },
                    { special: "75%", pct: 0.75, digits: ["4", "5", "6"] },
                    { special: "50%", pct: 0.5, digits: ["7", "8", "9"] },
                    { special: "CLEAR", pct: 0, digits: [".", "0", "⌫"] },
                  ].map((row, ri) => (
                    <View key={ri} style={styles.keyRow}>
                      <TouchableOpacity
                        style={styles.specialKey}
                        onPress={() => (row.special === "CLEAR" ? setAmount("") : setPercentage(row.pct))}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.specialKeyText}>{row.special}</Text>
                      </TouchableOpacity>
                      {row.digits.map((d) => (
                        <TouchableOpacity
                          key={d}
                          style={styles.numKey}
                          onPress={() => (d === "⌫" ? backspace() : appendDigit(d))}
                          activeOpacity={0.6}
                        >
                          {d === "⌫" ? (
                            <Ionicons name="backspace-outline" size={22} color={TEXT_PRIMARY} />
                          ) : (
                            <Text style={styles.numKeyText}>{d}</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  ))}
                </View>
              </View>
            </Animated.View>

            {/* ═══════════════════════════════════════ */}
            {/* STEP 2 — Address Entry                 */}
            {/* ═══════════════════════════════════════ */}
            <Animated.View
              style={[styles.stepContainer, { transform: [{ translateX: step2TranslateX }] }]}
              pointerEvents={step === 2 ? "auto" : "none"}
            >
              {/* Top bar */}
              <View style={styles.topBar}>
                <TouchableOpacity onPress={goBackToStep1} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="chevron-back" size={22} color={TEXT_PRIMARY} />
                </TouchableOpacity>
                <Text style={styles.topBarTitle}>To Address</Text>
                <TouchableOpacity onPress={handleClose} style={styles.iconBtn} activeOpacity={0.7}>
                  <Ionicons name="close" size={20} color={TEXT_PRIMARY} />
                </TouchableOpacity>
              </View>

              <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
                keyboardVerticalOffset={insets.top + 60}
              >
                <View style={styles.addressContent}>
                  {/* Address input */}
                  <View style={styles.addressInputRow}>
                    <Text style={styles.toLabel}>To:</Text>
                    <TextInput
                      value={toAddress}
                      onChangeText={setToAddress}
                      placeholder="Enter address..."
                      placeholderTextColor={TEXT_MUTED}
                      autoCapitalize="none"
                      autoCorrect={false}
                      style={styles.addressInput}
                      selectionColor={YELLOW}
                    />
                    <TouchableOpacity onPress={pasteAddress} style={styles.pasteBtn} activeOpacity={0.7}>
                      <Text style={styles.pasteBtnText}>Paste</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Tabs */}
                  <View style={styles.tabRow}>
                    <TouchableOpacity onPress={() => setAddressTab("book")} activeOpacity={0.7}>
                      <Text style={[styles.tabLabel, addressTab === "book" && styles.tabLabelActive]}>Address Book</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setAddressTab("recent")} activeOpacity={0.7}>
                      <Text style={[styles.tabLabel, addressTab === "recent" && styles.tabLabelActive]}>Recently Used</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Wallet list */}
                  <FlatList
                    data={displayWallets}
                    keyExtractor={(item) => item.address}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 20, flexGrow: 1 }}
                    keyboardShouldPersistTaps="handled"
                    ListEmptyComponent={
                      <View style={styles.emptyState}>
                        <Ionicons name="wallet-outline" size={40} color={TEXT_MUTED} />
                        <Text style={styles.emptyTitle}>
                          {addressTab === "recent" ? "No recent addresses" : "No saved addresses"}
                        </Text>
                        <Text style={styles.emptySubtitle}>
                          Addresses you send to will appear here
                        </Text>
                      </View>
                    }
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.walletRow}
                        activeOpacity={0.7}
                        onPress={() => {
                          setToAddress(item.address);
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        }}
                      >
                        <View style={[styles.walletAvatar, { backgroundColor: colorForAddress(item.address) }]}>
                          <Text style={styles.walletEmoji}>{item.emoji || "💰"}</Text>
                        </View>
                        <View style={styles.walletInfo}>
                          <Text style={styles.walletName}>{item.label || "Wallet"}</Text>
                          <Text style={styles.walletAddr}>{shortenAddress(item.address)}</Text>
                        </View>
                        {toAddress === item.address && (
                          <Ionicons name="checkmark-circle" size={22} color={YELLOW} />
                        )}
                      </TouchableOpacity>
                    )}
                  />
                </View>

                {/* Bottom CTA area */}
                <View style={[styles.bottomCta, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                  {/* Amount summary */}
                  <View style={styles.summaryRow}>
                    <Text style={styles.summaryLabel}>Sending</Text>
                    <Text style={styles.summaryValue}>{amountValue.toFixed(6)} USDC</Text>
                  </View>

                  <TouchableOpacity activeOpacity={0.85} disabled={!canSubmit} onPress={handleSubmit}>
                    <LinearGradient
                      colors={canSubmit ? ["#000000", "#1A1A1A"] : ["#D1D5DB", "#E5E7EB"]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.ctaButton}
                    >
                      {submitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={[styles.ctaText, !canSubmit && styles.ctaTextDisabled]}>
                          {toAddress.trim().length < 10 ? "Enter destination address" : "Withdraw"}
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              </KeyboardAvoidingView>
            </Animated.View>
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
    height: "86%",
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
  content: {
    flex: 1,
    overflow: "hidden",
  },

  // ── Top bar ──
  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  topBarTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: 0.3,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.08)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Step container ──
  stepContainer: {
    ...StyleSheet.absoluteFillObject,
  },

  // ── Amount area (step 1) ──
  amountArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 8,
  },
  tokenPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE_BG,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  usdcIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: "#1E40AF",
    justifyContent: "center",
    alignItems: "center",
  },
  usdcIconText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  tokenLabel: {
    fontSize: 16,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: 0.5,
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
    paddingVertical: 8,
    gap: 8,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  balanceText: {
    fontSize: 14,
    color: TEXT_DIM,
    fontWeight: "600",
  },
  warningText: {
    color: "#FF10F0",
    fontSize: 13,
    fontWeight: "600",
    marginTop: 12,
  },

  // ── Keypad (step 1) ──
  keypadSection: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  ctaButton: {
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  ctaText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#FFFFFF",
    letterSpacing: 0.5,
  },
  ctaTextDisabled: {
    color: "rgba(17,24,28,0.55)",
  },
  keypadGrid: {
    gap: 6,
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
    width: 76,
    height: 54,
    borderRadius: 14,
    backgroundColor: SURFACE_BG,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  specialKeyText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    letterSpacing: 0.5,
  },

  // ── Address (step 2) ──
  addressContent: {
    flex: 1,
    paddingHorizontal: 20,
  },
  addressInputRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: SURFACE_BG,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 56,
    marginTop: 4,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: SURFACE_BORDER,
  },
  toLabel: {
    fontSize: 15,
    color: TEXT_DIM,
    fontWeight: "600",
    marginRight: 10,
  },
  addressInput: {
    flex: 1,
    fontSize: 15,
    color: TEXT_PRIMARY,
    fontWeight: "500",
    paddingVertical: 0,
  },
  pasteBtn: {
    backgroundColor: "rgba(0,0,0,0.08)",
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 7,
    marginLeft: 8,
  },
  pasteBtnText: {
    fontSize: 13,
    fontWeight: "700",
    color: TEXT_PRIMARY,
  },

  // Tabs
  tabRow: {
    flexDirection: "row",
    gap: 20,
    marginBottom: 16,
    paddingLeft: 2,
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: TEXT_DIM,
  },
  tabLabelActive: {
    color: TEXT_PRIMARY,
    fontWeight: "700",
  },

  // Wallet rows
  walletRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E7EB",
  },
  walletAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    justifyContent: "center",
    alignItems: "center",
  },
  walletEmoji: {
    fontSize: 20,
  },
  walletInfo: {
    flex: 1,
    marginLeft: 14,
  },
  walletName: {
    fontSize: 15,
    fontWeight: "700",
    color: TEXT_PRIMARY,
    marginBottom: 2,
  },
  walletAddr: {
    fontSize: 13,
    color: TEXT_DIM,
    fontWeight: "500",
  },

  // Empty state
  emptyState: {
    alignItems: "center",
    paddingTop: 48,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: TEXT_DIM,
  },
  emptySubtitle: {
    fontSize: 13,
    color: TEXT_MUTED,
    textAlign: "center",
  },

  // Bottom CTA
  bottomCta: {
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E5E7EB",
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 14,
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
});
