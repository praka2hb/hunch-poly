import { Theme } from '@/constants/theme';
import { useCopyTrading } from '@/hooks/useCopyTrading';
import { CopySettings } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Animated,
    Dimensions,
    Easing,
    Keyboard,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface CopySettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
    leaderId: string;
    leaderName: string;
    onSave?: () => void;
}

export default function CopySettingsModal({
    isOpen,
    onClose,
    leaderId,
    leaderName,
    onSave,
}: CopySettingsModalProps) {
    const {
        enableCopyTrading,
        disableCopyTrading,
        getCopySettingsForLeader,
        isLoading,
        error,
        clearError,
    } = useCopyTrading();

    const [amountPerTrade, setAmountPerTrade] = useState<string>('');
    const [maxTotalAmount, setMaxTotalAmount] = useState<string>('');
    const [existingSettings, setExistingSettings] = useState<CopySettings | null>(null);
    const [localError, setLocalError] = useState<string | null>(null);
    const [fetching, setFetching] = useState(false);

    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(SCREEN_HEIGHT)).current;

    const [showModal, setShowModal] = useState(isOpen);

    useEffect(() => {
        if (isOpen) {
            setShowModal(true);
            if (leaderId) fetchExistingSettings();
            clearError();
            setLocalError(null);

            // Animate In
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 1,
                    duration: 280,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
                Animated.timing(slideAnim, {
                    toValue: 0,
                    duration: 320,
                    useNativeDriver: true,
                    easing: Easing.out(Easing.cubic),
                }),
            ]).start();
        } else {
            // Animate Out
            Animated.parallel([
                Animated.timing(fadeAnim, {
                    toValue: 0,
                    duration: 200,
                    useNativeDriver: true,
                }),
                Animated.timing(slideAnim, {
                    toValue: SCREEN_HEIGHT,
                    duration: 250,
                    useNativeDriver: true,
                }),
            ]).start(({ finished }) => {
                if (finished) {
                    setShowModal(false);
                }
            });
        }
    }, [isOpen, leaderId]);

    const fetchExistingSettings = async () => {
        setFetching(true);
        try {
            const settings = await getCopySettingsForLeader(leaderId);
            if (settings) {
                setExistingSettings(settings);
                setAmountPerTrade(settings.amountPerTrade.toString());
                setMaxTotalAmount(settings.maxTotalAmount.toString());
            } else {
                setExistingSettings(null);
                setAmountPerTrade('');
                setMaxTotalAmount('');
            }
        } catch (err) {
            console.error('Error fetching copy settings:', err);
        } finally {
            setFetching(false);
        }
    };

    const handleClose = () => {
        Keyboard.dismiss();
        onClose();
    };

    const handleSave = async () => {
        setLocalError(null);
        const amountNum = parseFloat(amountPerTrade);
        const maxNum = parseFloat(maxTotalAmount);

        if (isNaN(amountNum) || amountNum <= 0) {
            setLocalError('Enter valid amount per trade');
            return;
        }
        if (isNaN(maxNum) || maxNum <= 0) {
            setLocalError('Enter valid total cap');
            return;
        }
        if (amountNum > maxNum) {
            setLocalError('Amount cannot exceed cap');
            return;
        }

        try {
            await enableCopyTrading(leaderId, leaderName, {
                amountPerTrade: amountNum,
                maxTotalAmount: maxNum,
            });
            onSave?.();
            onClose();
        } catch (err: any) {
            setLocalError(err.message || 'Failed to save settings');
        }
    };

    const handleRemove = async () => {
        try {
            await disableCopyTrading(leaderId);
            onSave?.();
            onClose();
        } catch (err: any) {
            setLocalError(err.message || 'Failed to remove copy settings');
        }
    };

    // Correctly handle undefined values to prevent toFixed crash
    const spentAmount = existingSettings?.spentAmount ?? 0;
    const maxTotal = existingSettings?.maxTotalAmount || 1; // Avoid division by zero
    const usedPct = existingSettings
        ? Math.min((spentAmount / maxTotal) * 100, 100)
        : 0;

    const displayError = localError || error;

    return (
        <Modal
            visible={showModal}
            transparent
            animationType="none"
            onRequestClose={handleClose}
            statusBarTranslucent
        >
            <TouchableWithoutFeedback onPress={handleClose}>
                <View style={StyleSheet.absoluteFill}>
                    <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
                    <Animated.View
                        style={[
                            styles.backdrop,
                            { opacity: fadeAnim }
                        ]}
                    />
                </View>
            </TouchableWithoutFeedback>

            <View style={styles.sheetContainer} pointerEvents="box-none">
                <Animated.View
                    style={[
                        styles.sheet,
                        { transform: [{ translateY: slideAnim }] }
                    ]}
                >
                    {/* Header */}
                    <View className="flex-row items-center justify-between mb-6">
                        <View>
                            <Text className="text-xl font-bold text-txt-primary">Copy Settings</Text>
                            <Text className="text-base font-medium text-txt-secondary">{leaderName}</Text>
                        </View>
                        <TouchableOpacity
                            onPress={handleClose}
                            className="w-8 h-8 rounded-full bg-app-elevated items-center justify-center"
                        >
                            <Ionicons name="close" size={20} color={Theme.textSecondary} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView>
                        {fetching ? (
                            <View className="py-10 items-center">
                                <ActivityIndicator size="large" color={Theme.textPrimary} />
                            </View>
                        ) : (
                            <View className="gap-6">
                                {/* Budget Progress (Only if existing) */}
                                {existingSettings && (
                                    <View>
                                        <View className="flex-row justify-between mb-2">
                                            <Text className="text-xs font-medium text-txt-tertiary uppercase tracking-wide">Budget Used</Text>
                                            <Text className="text-xs font-mono text-txt-secondary">
                                                ${spentAmount.toFixed(0)} / ${(existingSettings?.maxTotalAmount ?? 0).toFixed(0)}
                                            </Text>
                                        </View>
                                        <View className="h-2 bg-app-elevated rounded-full overflow-hidden">
                                            <View
                                                className="h-full bg-txt-primary rounded-full" // Changed from secondary for cooler look
                                                style={{ width: `${usedPct}%` }}
                                            />
                                        </View>
                                    </View>
                                )}

                                {/* Inputs */}
                                <View className="flex-row gap-4">
                                    <View className="flex-1">
                                        <Text className="text-xs font-medium text-txt-secondary mb-2 uppercase tracking-wide">Per Trade</Text>
                                        <View className="flex-row items-center bg-app-elevated rounded-xl px-4 py-3.5 border border-border">
                                            <Text className="text-lg font-bold text-txt-primary mr-1" style={{ includeFontPadding: false, textAlignVertical: 'center' }}>$</Text>
                                            <TextInput
                                                value={amountPerTrade}
                                                onChangeText={setAmountPerTrade}
                                                placeholder="10"
                                                keyboardType="numeric"
                                                returnKeyType="done"
                                                onSubmitEditing={Keyboard.dismiss}
                                                placeholderTextColor={Theme.textDisabled}
                                                className="flex-1 text-lg font-bold text-txt-primary p-0"
                                                style={{ includeFontPadding: false, textAlignVertical: 'center' }}
                                            />
                                        </View>
                                    </View>
                                    <View className="flex-1">
                                        <Text className="text-xs font-medium text-txt-secondary mb-2 uppercase tracking-wide">Total Cap</Text>
                                        <View className="flex-row items-center bg-app-elevated rounded-xl px-4 py-3.5 border border-border">
                                            <Text className="text-lg font-bold text-txt-primary mr-1" style={{ includeFontPadding: false, textAlignVertical: 'center' }}>$</Text>
                                            <TextInput
                                                value={maxTotalAmount}
                                                onChangeText={setMaxTotalAmount}
                                                placeholder="100"
                                                keyboardType="numeric"
                                                returnKeyType="done"
                                                onSubmitEditing={Keyboard.dismiss}
                                                placeholderTextColor={Theme.textDisabled}
                                                className="flex-1 text-lg font-bold text-txt-primary p-0"
                                                style={{ includeFontPadding: false, textAlignVertical: 'center' }}
                                            />
                                        </View>
                                    </View>
                                </View>

                                {displayError && (
                                    <View className="p-3 bg-red-500/10 rounded-lg border border-red-500/20">
                                        <Text className="text-xs font-medium text-red-500">{displayError}</Text>
                                    </View>
                                )}

                                {/* Action Buttons */}
                                <View className="mt-2 gap-3">
                                    <TouchableOpacity
                                        onPress={handleSave}
                                        disabled={isLoading}
                                        className="w-full py-4 bg-[#FEEC28] rounded-xl items-center justify-center disabled:opacity-70"
                                    >
                                        {isLoading ? (
                                            <ActivityIndicator size="small" color="#000000" />
                                        ) : (
                                            <Text className="text-base font-bold text-black">
                                                {existingSettings ? 'Update Settings' : 'Start Copying'}
                                            </Text>
                                        )}
                                    </TouchableOpacity>

                                    {existingSettings && (
                                        <TouchableOpacity
                                            onPress={handleRemove}
                                            disabled={isLoading}
                                            className="w-full py-3 items-center justify-center"
                                        >
                                            <Text className="text-sm font-medium text-red-500">Stop Copying</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                    <View className="h-safe-bottom" />
                </Animated.View>
            </View>
        </Modal >
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheetContainer: {
        flex: 1,
        justifyContent: 'flex-end',
    },
    sheet: {
        backgroundColor: Theme.bgCard,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 24,
        paddingBottom: Platform.OS === 'ios' ? 32 : 24,
        width: '100%',
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -4,
        },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 10,
    },
});
