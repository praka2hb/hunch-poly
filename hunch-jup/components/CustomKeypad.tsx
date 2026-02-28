import { Theme } from "@/constants/theme";
import { BlurView } from "expo-blur";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Dimensions, Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

type CustomKeypadProps = {
  visible: boolean;
  value: string;
  onChange: (next: string) => void;
  onClose: () => void;
  allowDecimal?: boolean;
  maxDecimals?: number;
  label?: string;
  probability?: number; // Probability percentage (0-100) for calculating "to win"
  selectedSide?: 'yes' | 'no'; // Selected side for the bet
};

const KeyButton = ({
  label,
  onPress,
  variant = "default",
}: {
  label: string;
  onPress: () => void;
  variant?: "default" | "primary";
}) => (
  <TouchableOpacity
    className={`flex-1 h-12 rounded-xl items-center justify-center ${
      variant === "primary" ? "bg-txt-primary" : "bg-app-card"
    }`}
    onPress={onPress}
    activeOpacity={0.8}
  >
    <Text
      className={`text-lg font-semibold ${
        variant === "primary" ? "text-app-bg" : "text-txt-primary"
      }`}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export default function CustomKeypad({
  visible,
  value,
  onChange,
  onClose,
  allowDecimal = true,
  maxDecimals = 2,
  label = "Amount",
  probability,
  selectedSide,
}: CustomKeypadProps) {
  const insets = useSafeAreaInsets();
  // Increase height to accommodate "to win" display, positioned higher on screen
  const sheetHeight = Math.min(520, Math.round(Dimensions.get("window").height * 0.7));
  
  // Calculate "to win" amount
  const calculateToWin = (): string => {
    if (!probability || !value || parseFloat(value) <= 0) return "0.00";
    const amount = parseFloat(value);
    const prob = selectedSide === 'yes' ? probability : (100 - probability);
    const toWin = amount * (100 / prob);
    return toWin.toFixed(2);
  };

  const appendDigit = (digit: string) => {
    let next = value || "";
    if (next === "0" && digit !== ".") next = "";
    if (digit === "." && !allowDecimal) return;
    if (digit === "." && next.includes(".")) return;
    next = `${next}${digit}`;
    if (next.includes(".")) {
      const [, decimals = ""] = next.split(".");
      if (decimals.length > maxDecimals) return;
    }
    onChange(next);
  };

  const backspace = () => {
    if (!value) return;
    if (value.length === 1) {
      onChange("");
      return;
    }
    onChange(value.slice(0, -1));
  };

  const clear = () => onChange("");

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable className="flex-1 justify-end" onPress={onClose} style={StyleSheet.absoluteFill}>
        <BlurView intensity={25} tint="default" style={StyleSheet.absoluteFill} />
        <View style={styles.backdropTint} />
        <View
          className="bg-app-bg rounded-t-3xl px-4 pt-4"
          style={{ 
            paddingBottom: Math.max(insets.bottom, 16), 
            height: sheetHeight,
            marginBottom: 0, // Position higher by removing bottom margin
          }}
        >
          <View className="items-center mb-3">
            <View className="w-12 h-1.5 rounded-full bg-border" />
          </View>

          {/* Amount Input and To Win - Side by side when both are shown */}
          {probability !== undefined && selectedSide ? (
            <View className="flex-row gap-3 mb-3">
              {/* Amount Input */}
              <View className="flex-1">
                <Text className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-2">
                  {label}
                </Text>
                <View className="bg-app-card rounded-2xl px-4 py-3 border border-border">
                  <Text className="text-2xl font-bold text-txt-primary">
                    ${value || (allowDecimal ? "0.00" : "0")}
                  </Text>
                </View>
              </View>

              {/* To Win Amount */}
              <View className="flex-1">
                <Text className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-2">
                  To Win
                </Text>
                <View className="bg-app-card rounded-2xl px-4 py-3 border border-border">
                  <Text className="text-2xl font-bold text-txt-primary">
                    ${calculateToWin()}
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            /* Amount Input only */
            <View className="mb-3">
              <Text className="text-xs font-bold text-txt-secondary uppercase tracking-wide mb-2">
                {label}
              </Text>
              <View className="bg-app-card rounded-2xl px-4 py-3 border border-border">
                <Text className="text-2xl font-bold text-txt-primary">
                  ${value || (allowDecimal ? "0.00" : "0")}
                </Text>
              </View>
            </View>
          )}

          <View className="gap-2.5">
            {[
              ["1", "2", "3"],
              ["4", "5", "6"],
              ["7", "8", "9"],
              [allowDecimal ? "." : "", "0", "⌫"],
            ].map((row, rowIndex) => (
              <View key={`row-${rowIndex}`} className="flex-row gap-3">
                {row.map((key) => {
                  if (!key) {
                    return <View key={`key-empty-${rowIndex}`} className="flex-1" />;
                  }
                  if (key === "⌫") {
                    return <KeyButton key="backspace" label="⌫" onPress={backspace} />;
                  }
                  return <KeyButton key={key} label={key} onPress={() => appendDigit(key)} />;
                })}
              </View>
            ))}
          </View>

          <View className="flex-row gap-3 mt-4">
            <KeyButton label="Clear" onPress={clear} />
            <KeyButton label="Done" onPress={onClose} variant="primary" />
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
  },
});
