import { Theme } from '@/constants/theme';
import { api } from '@/lib/api';
import { User, UserPosition } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    FlatList,
    Image,
    Keyboard,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const defaultProfileImage = require('@/assets/default.jpeg');

interface PostComposerSheetProps {
    visible: boolean;
    onClose: () => void;
    backendUser: User | null;
    onPostSuccess?: () => void;
}

type PositionTab = 'active' | 'previous';

export default function PostComposerSheet({
    visible,
    onClose,
    backendUser,
    onPostSuccess,
}: PostComposerSheetProps) {
    const insets = useSafeAreaInsets();
    const [text, setText] = useState('');
    const [activePositions, setActivePositions] = useState<UserPosition[]>([]);
    const [previousPositions, setPreviousPositions] = useState<UserPosition[]>([]);
    const [loadingPositions, setLoadingPositions] = useState(false);
    const [showPositionPicker, setShowPositionPicker] = useState(false);
    const [positionTab, setPositionTab] = useState<PositionTab>('active');
    // Only one position can be attached per post
    const [embeddedPosition, setEmbeddedPosition] = useState<UserPosition | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (visible && backendUser) {
            loadPositions();
        }
        if (!visible) {
            setText('');
            setEmbeddedPosition(null);
            setShowPositionPicker(false);
            setPositionTab('active');
        }
    }, [visible, backendUser]);

    const loadPositions = async () => {
        if (!backendUser) return;
        setLoadingPositions(true);
        try {
            const resp = await api.getUserPositions(backendUser.id);
            setActivePositions(resp.positions || []);
            setPreviousPositions(resp.previousPositions || []);
        } catch (err) {
            console.error('Failed to load positions:', err);
        } finally {
            setLoadingPositions(false);
        }
    };

    const selectPosition = useCallback((pos: UserPosition) => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        setEmbeddedPosition(pos);
        setShowPositionPicker(false);
    }, []);

    const clearPosition = useCallback(() => {
        setEmbeddedPosition(null);
    }, []);

    const handlePost = async () => {
        const hasContent = text.trim().length > 0;
        const hasPosition = embeddedPosition !== null;
        if (!hasContent && !hasPosition) return;
        if (!backendUser) return;

        setIsSubmitting(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

        try {
            if (hasPosition) {
                await api.createPost({
                    content: text.trim() || undefined,
                    postType: 'position_share',
                    marketTicker: embeddedPosition!.marketTicker,
                    side: embeddedPosition!.side,
                    positionSize: embeddedPosition!.netSize,
                    entryPrice: embeddedPosition!.avgEntryPrice,
                });
            } else {
                await api.createPost({
                    content: text.trim(),
                    postType: 'text',
                });
            }

            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            onPostSuccess?.();
            onClose();
        } catch (err) {
            console.error('Failed to create post:', err);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } finally {
            setIsSubmitting(false);
        }
    };

    const canPost = text.trim().length > 0 || embeddedPosition !== null;
    const avatarUrl = backendUser?.avatarUrl?.replace('_normal', '');
    const currentTabData = positionTab === 'active' ? activePositions : previousPositions;

    const renderPositionRow = ({ item }: { item: UserPosition }) => {
        const isYes = item.side === 'yes';
        const isSelected =
            embeddedPosition?.marketTicker === item.marketTicker &&
            embeddedPosition?.side === item.side;
        const pnlColor = (item.pnlPercent ?? 0) >= 0 ? '#32de12' : '#FF10F0';

        return (
            <TouchableOpacity
                style={[styles.positionRow, isSelected && styles.positionRowSelected]}
                onPress={() => selectPosition(item)}
                activeOpacity={0.7}
            >
                {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.positionImage} />
                ) : (
                    <View style={[styles.positionImage, styles.positionImagePlaceholder]}>
                        <Ionicons name="stats-chart" size={14} color="#9CA3AF" />
                    </View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.positionTitle} numberOfLines={1}>
                        {item.marketSubtitle || item.marketTitle || item.marketTicker}
                    </Text>
                    <View style={styles.positionMeta}>
                        <View style={[styles.sideBadge, { backgroundColor: isYes ? '#F0FFF4' : '#FFF0F5' }]}>
                            <Text style={[styles.sideBadgeText, { color: isYes ? '#32de12' : '#FF10F0', fontSize: 11 }]}>
                                {item.side.toUpperCase()}
                            </Text>
                        </View>
                        <Text style={styles.positionMetaText}>
                            ${item.enteredAmount.toFixed(2)}
                        </Text>
                        {item.pnlPercent != null && (
                            <Text style={[styles.positionPnl, { color: pnlColor }]}>
                                {item.pnlPercent >= 0 ? '+' : ''}{item.pnlPercent.toFixed(1)}%
                            </Text>
                        )}
                    </View>
                </View>
                {isSelected ? (
                    <Ionicons name="checkmark-circle" size={24} color="#32de12" />
                ) : (
                    <Ionicons name="add-circle-outline" size={24} color={Theme.textPrimary} />
                )}
            </TouchableOpacity>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
            <View style={[styles.container, { paddingTop: insets.top }]}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity onPress={onClose} style={styles.headerButton}>
                        <Text style={styles.cancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <Text style={styles.headerTitle}>New Post</Text>
                    <TouchableOpacity
                        onPress={handlePost}
                        disabled={!canPost || isSubmitting}
                        style={[styles.postButton, canPost && styles.postButtonActive]}
                    >
                        {isSubmitting ? (
                            <ActivityIndicator size="small" color="#fff" />
                        ) : (
                            <Text style={[styles.postButtonText, canPost && styles.postButtonTextActive]}>Post</Text>
                        )}
                    </TouchableOpacity>
                </View>

                <KeyboardAvoidingView
                    behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
                    style={{ flex: 1 }}
                    keyboardVerticalOffset={insets.top + 50}
                >
                    {/* Compose Area */}
                    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={styles.composeArea}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={false}
                    >
                        <View style={styles.avatarRow}>
                            <View style={styles.avatar}>
                                <Image
                                    source={avatarUrl ? { uri: avatarUrl } : defaultProfileImage}
                                    style={styles.avatarImage}
                                />
                            </View>
                            <Text style={styles.displayName}>
                                {backendUser?.displayName || backendUser?.username || 'You'}
                            </Text>
                        </View>

                        <TextInput
                            style={styles.textInput}
                            placeholder="What's on your mind?"
                            placeholderTextColor="#9CA3AF"
                            value={text}
                            onChangeText={setText}
                            multiline
                            maxLength={500}
                            textAlignVertical="top"
                            autoFocus
                        />

                        {text.length > 0 && (
                            <Text style={styles.charCount}>{text.length}/500</Text>
                        )}

                        {/* Embedded Position Card */}
                        {embeddedPosition && (
                            <View style={styles.embeddedCard}>
                                {/* Image + title row */}
                                <View style={styles.embeddedCardTop}>
                                    {embeddedPosition.imageUrl ? (
                                        <Image
                                            source={{ uri: embeddedPosition.imageUrl }}
                                            style={styles.embeddedMarketImage}
                                        />
                                    ) : (
                                        <View style={[styles.embeddedMarketImage, styles.embeddedMarketImagePlaceholder]}>
                                            <Ionicons name="stats-chart" size={16} color="#9CA3AF" />
                                        </View>
                                    )}
                                    <View style={{ flex: 1 }}>
                                        <Text style={styles.embeddedTitle} numberOfLines={2}>
                                            {embeddedPosition.marketSubtitle || embeddedPosition.marketTitle || embeddedPosition.marketTicker}
                                        </Text>
                                        <View style={styles.embeddedCardBadges}>
                                            <View style={[
                                                styles.sideBadge,
                                                { backgroundColor: embeddedPosition.side === 'yes' ? '#F0FFF4' : '#FFF0F5' }
                                            ]}>
                                                <Text style={[
                                                    styles.sideBadgeText,
                                                    { color: embeddedPosition.side === 'yes' ? '#32de12' : '#FF10F0' }
                                                ]}>
                                                    {embeddedPosition.side.toUpperCase()}
                                                </Text>
                                            </View>
                                            {embeddedPosition.isClosed && (
                                                <View style={styles.closedBadge}>
                                                    <Text style={styles.closedBadgeText}>Closed</Text>
                                                </View>
                                            )}
                                        </View>
                                    </View>
                                    <TouchableOpacity onPress={clearPosition} hitSlop={12}>
                                        <Ionicons name="close-circle" size={22} color="#9CA3AF" />
                                    </TouchableOpacity>
                                </View>
                                {/* Stats row */}
                                <View style={styles.embeddedStats}>
                                    <View style={styles.embeddedStat}>
                                        <Text style={styles.embeddedStatLabel}>Entry</Text>
                                        <Text style={styles.embeddedStatValue}>
                                            {(embeddedPosition.avgEntryPrice * 100).toFixed(1)}¢
                                        </Text>
                                    </View>
                                    <View style={styles.embeddedStat}>
                                        <Text style={styles.embeddedStatLabel}>Size</Text>
                                        <Text style={styles.embeddedStatValue}>
                                            ${embeddedPosition.enteredAmount.toFixed(2)}
                                        </Text>
                                    </View>
                                    {embeddedPosition.pnlPercent != null && (
                                        <View style={styles.embeddedStat}>
                                            <Text style={styles.embeddedStatLabel}>P&L</Text>
                                            <Text style={[
                                                styles.embeddedStatValue,
                                                { color: embeddedPosition.pnlPercent >= 0 ? '#32de12' : '#FF10F0' }
                                            ]}>
                                                {embeddedPosition.pnlPercent >= 0 ? '+' : ''}{embeddedPosition.pnlPercent.toFixed(1)}%
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        )}
                    </ScrollView>
                    </TouchableWithoutFeedback>

                    {/* Toolbar */}
                    <View style={[styles.toolbar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                        <TouchableOpacity
                            style={styles.toolbarButton}
                            onPress={() => {
                                Keyboard.dismiss();
                                setShowPositionPicker(true);
                            }}
                        >
                            <Ionicons name="stats-chart" size={20} color={Theme.textPrimary} />
                            <Text style={styles.toolbarButtonText}>
                                {embeddedPosition ? 'Change Position' : 'Add Position'}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>

            {/* Position Picker Bottom Sheet */}
            <Modal
                visible={showPositionPicker}
                transparent
                animationType="slide"
                onRequestClose={() => setShowPositionPicker(false)}
            >
                <View style={styles.pickerOverlay}>
                    <Pressable style={{ flex: 1 }} onPress={() => setShowPositionPicker(false)} />
                    <View style={[styles.pickerSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
                        <View style={styles.pickerHandle} />

                        {/* Active / Previous tabs */}
                        <View style={styles.tabRow}>
                            <TouchableOpacity
                                style={[styles.tab, positionTab === 'active' && styles.tabActive]}
                                onPress={() => setPositionTab('active')}
                            >
                                <Text style={[styles.tabText, positionTab === 'active' && styles.tabTextActive]}>
                                    Active ({activePositions.length})
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={[styles.tab, positionTab === 'previous' && styles.tabActive]}
                                onPress={() => setPositionTab('previous')}
                            >
                                <Text style={[styles.tabText, positionTab === 'previous' && styles.tabTextActive]}>
                                    Previous ({previousPositions.length})
                                </Text>
                            </TouchableOpacity>
                        </View>

                        {loadingPositions ? (
                            <View style={styles.pickerLoading}>
                                <ActivityIndicator size="large" color={Theme.textSecondary} />
                            </View>
                        ) : currentTabData.length === 0 ? (
                            <View style={styles.pickerEmpty}>
                                <Ionicons name="wallet-outline" size={40} color="#D1D5DB" />
                                <Text style={styles.pickerEmptyText}>
                                    No {positionTab === 'active' ? 'active' : 'previous'} positions
                                </Text>
                            </View>
                        ) : (
                            <FlatList
                                data={currentTabData}
                                keyExtractor={(item) => `${item.marketTicker}-${item.side}`}
                                style={{ maxHeight: 400 }}
                                renderItem={renderPositionRow}
                                showsVerticalScrollIndicator={false}
                            />
                        )}
                    </View>
                </View>
            </Modal>
        </Modal>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#FFFFFF',
    },
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#E5E7EB',
    },
    headerButton: {
        paddingVertical: 4,
        paddingHorizontal: 4,
    },
    cancelText: {
        fontSize: 16,
        color: '#6B7280',
        fontWeight: '500',
    },
    headerTitle: {
        fontSize: 17,
        fontWeight: '700',
        color: '#111827',
    },
    postButton: {
        paddingVertical: 8,
        paddingHorizontal: 20,
        borderRadius: 20,
        backgroundColor: '#E5E7EB',
        minWidth: 64,
        alignItems: 'center',
    },
    postButtonActive: {
        backgroundColor: '#e8d723',
    },
    postButtonText: {
        fontSize: 15,
        fontWeight: '700',
        color: '#9CA3AF',
    },
    postButtonTextActive: {
        color: '#111827',
    },
    composeArea: {
        paddingHorizontal: 20,
        paddingTop: 16,
        paddingBottom: 8,
    },
    avatarRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 12,
        gap: 12,
    },
    avatar: {
        width: 44,
        height: 44,
        borderRadius: 22,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
    },
    avatarImage: {
        width: 44,
        height: 44,
        borderRadius: 22,
    },
    displayName: {
        fontSize: 16,
        fontWeight: '700',
        color: '#111827',
    },
    textInput: {
        fontSize: 18,
        lineHeight: 26,
        color: '#111827',
        minHeight: 120,
        paddingTop: 0,
    },
    charCount: {
        fontSize: 12,
        color: '#9CA3AF',
        textAlign: 'right',
        marginTop: 4,
    },
    // Embedded position card
    embeddedCard: {
        marginTop: 16,
        backgroundColor: '#F9FAFB',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#E5E7EB',
        padding: 14,
        gap: 10,
    },
    embeddedCardTop: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 10,
    },
    embeddedMarketImage: {
        width: 52,
        height: 52,
        borderRadius: 10,
    },
    embeddedMarketImagePlaceholder: {
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    embeddedCardBadges: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        marginTop: 6,
    },
    sideBadge: {
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 8,
    },
    sideBadgeText: {
        fontSize: 13,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    closedBadge: {
        paddingHorizontal: 8,
        paddingVertical: 3,
        borderRadius: 6,
        backgroundColor: '#E5E7EB',
    },
    closedBadgeText: {
        fontSize: 11,
        fontWeight: '600',
        color: '#6B7280',
    },
    embeddedTitle: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
        lineHeight: 19,
        flexShrink: 1,
    },
    embeddedStats: {
        flexDirection: 'row',
        gap: 20,
    },
    embeddedStat: {
        gap: 2,
    },
    embeddedStatLabel: {
        fontSize: 11,
        color: '#9CA3AF',
        fontWeight: '500',
    },
    embeddedStatValue: {
        fontSize: 14,
        fontWeight: '700',
        color: '#111827',
    },
    // Toolbar
    toolbar: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 12,
        borderTopWidth: 1,
        borderTopColor: '#E5E7EB',
        gap: 12,
    },
    toolbarButton: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
    },
    toolbarButtonText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#111827',
    },
    // Picker sheet
    pickerOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.3)',
        justifyContent: 'flex-end',
    },
    pickerSheet: {
        backgroundColor: '#FFFFFF',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        paddingHorizontal: 20,
        paddingTop: 12,
    },
    pickerHandle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: '#D1D5DB',
        alignSelf: 'center',
        marginBottom: 16,
    },
    tabRow: {
        flexDirection: 'row',
        marginBottom: 12,
        borderRadius: 12,
        backgroundColor: '#F3F4F6',
        padding: 4,
        gap: 4,
    },
    tab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
    },
    tabActive: {
        backgroundColor: '#FFFFFF',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
        elevation: 2,
    },
    tabText: {
        fontSize: 14,
        fontWeight: '600',
        color: '#6B7280',
    },
    tabTextActive: {
        color: '#111827',
    },
    pickerLoading: {
        paddingVertical: 40,
        alignItems: 'center',
    },
    pickerEmpty: {
        paddingVertical: 40,
        alignItems: 'center',
        gap: 10,
    },
    pickerEmptyText: {
        fontSize: 15,
        color: '#9CA3AF',
    },
    positionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 14,
        paddingHorizontal: 4,
        borderBottomWidth: 1,
        borderBottomColor: '#F3F4F6',
    },
    positionRowSelected: {
        backgroundColor: '#FFFDE7',
        borderRadius: 12,
        paddingHorizontal: 10,
        borderBottomWidth: 0,
        marginBottom: 4,
    },
    positionImage: {
        width: 44,
        height: 44,
        borderRadius: 10,
    },
    positionImagePlaceholder: {
        backgroundColor: '#F3F4F6',
        justifyContent: 'center',
        alignItems: 'center',
    },
    positionTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#111827',
    },
    positionMeta: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginTop: 2,
    },
    positionMetaText: {
        fontSize: 13,
        color: '#6B7280',
    },
    positionPnl: {
        fontSize: 13,
        fontWeight: '700',
    },
});
