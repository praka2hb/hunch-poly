import { Theme } from '@/constants/theme';
import { formatPercent } from '@/lib/marketUtils';
import { Market } from '@/lib/types';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import { useEffect, useRef, useState } from 'react';
import {
    Animated,
    Dimensions,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface MarketPopoutProps {
    visible: boolean;
    market: Market | null;
    eventTitle?: string;
    onClose: () => void;
    onSave: (market: Market) => void;
    onGoToEvent: (market: Market) => void;
}

export default function MarketPopout({
    visible,
    market,
    eventTitle,
    onClose,
    onSave,
    onGoToEvent,
}: MarketPopoutProps) {
    const scaleAnim = useRef(new Animated.Value(0.85)).current;
    const opacityAnim = useRef(new Animated.Value(0)).current;
    const buttonsAnim = useRef(new Animated.Value(0)).current;
    const [isRendered, setIsRendered] = useState(false);
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        if (visible && market) {
            setIsRendered(true);
            setImageFailed(false);
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

            Animated.parallel([
                Animated.spring(scaleAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 60,
                    friction: 8,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 1,
                    duration: 200,
                    useNativeDriver: true,
                }),
            ]).start(() => {
                Animated.spring(buttonsAnim, {
                    toValue: 1,
                    useNativeDriver: true,
                    tension: 80,
                    friction: 10,
                }).start();
            });
        } else {
            Animated.parallel([
                Animated.timing(scaleAnim, {
                    toValue: 0.85,
                    duration: 180,
                    useNativeDriver: true,
                }),
                Animated.timing(opacityAnim, {
                    toValue: 0,
                    duration: 180,
                    useNativeDriver: true,
                }),
                Animated.timing(buttonsAnim, {
                    toValue: 0,
                    duration: 120,
                    useNativeDriver: true,
                }),
            ]).start(({ finished }) => {
                if (finished) setIsRendered(false);
            });
        }
    }, [visible, market]);

    if (!isRendered || !market) return null;

    const isBadImageUrl = (url: unknown) =>
        typeof url === 'string' && url.toLowerCase().includes('kalshi-fallback-images');
    const isFallbackImage = isBadImageUrl((market as any).image_url);
    const question = eventTitle || market.title;
    const answer = market.yesSubTitle || market.title;
    const yesBid = market.yesBid ? parseFloat(market.yesBid) * 100 : null;
    const oddsColor = yesBid === null ? Theme.textPrimary : yesBid >= 50 ? '#32de12' : Theme.chartNegative;

    const handleAction = (action: 'save' | 'event' | 'close') => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (action === 'save') onSave(market);
        else if (action === 'event') onGoToEvent(market);
        onClose();
    };

    const buttonScale = buttonsAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 1],
    });

    return (
        <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
            <Animated.View style={[StyleSheet.absoluteFill, { opacity: opacityAnim }]}>
                <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
            </Animated.View>

            <View style={styles.centeredContainer}>
                <Animated.View
                    style={[
                        styles.cardWrapper,
                        {
                            transform: [{ scale: scaleAnim }],
                            opacity: opacityAnim,
                        },
                    ]}
                >
                    {/* Popped-out card */}
                    <View style={styles.card}>
                        <View style={styles.cardContent}>
                            <View style={styles.imageContainer}>
                                {market.image_url && !isFallbackImage && !imageFailed ? (
                                    <Image
                                        source={{ uri: market.image_url }}
                                        style={styles.image}
                                        contentFit="cover"
                                        transition={200}
                                        onError={() => setImageFailed(true)}
                                    />
                                ) : (
                                    <View style={styles.imagePlaceholder}>
                                        <Ionicons name="image-outline" size={28} color={Theme.textDisabled} />
                                    </View>
                                )}
                            </View>

                            <View style={styles.textContainer}>
                                <Text style={styles.question} numberOfLines={2}>
                                    {question}
                                </Text>
                                <Text style={styles.answer} numberOfLines={2}>
                                    {answer}
                                </Text>
                            </View>

                            <View style={styles.oddsContainer}>
                                <Text style={[styles.odds, { color: oddsColor }]}>
                                    {yesBid !== null ? formatPercent(market.yesBid) : '—'}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Action buttons */}
                    <Animated.View
                        style={[
                            styles.buttonsRow,
                            {
                                transform: [{ scale: buttonScale }],
                                opacity: buttonsAnim,
                            },
                        ]}
                    >
                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleAction('save')}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: '#FFF8E1' }]}>
                                <Ionicons name="bookmark-outline" size={22} color="#F59E0B" />
                            </View>
                            <Text style={styles.actionLabel}>Save</Text>
                        </TouchableOpacity>

                        {market.eventTicker && (
                            <TouchableOpacity
                                style={styles.actionButton}
                                onPress={() => handleAction('event')}
                                activeOpacity={0.7}
                            >
                                <View style={[styles.actionIcon, { backgroundColor: '#E8F5E9' }]}>
                                    <Ionicons name="open-outline" size={22} color="#4CAF50" />
                                </View>
                                <Text style={styles.actionLabel}>Event</Text>
                            </TouchableOpacity>
                        )}

                        <TouchableOpacity
                            style={styles.actionButton}
                            onPress={() => handleAction('close')}
                            activeOpacity={0.7}
                        >
                            <View style={[styles.actionIcon, { backgroundColor: '#FFEBEE' }]}>
                                <Ionicons name="close" size={22} color="#EF5350" />
                            </View>
                            <Text style={styles.actionLabel}>Close</Text>
                        </TouchableOpacity>
                    </Animated.View>
                </Animated.View>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    centeredContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    cardWrapper: {
        width: '100%',
        alignItems: 'center',
    },
    card: {
        width: '100%',
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.2,
        shadowRadius: 24,
        elevation: 16,
    },
    cardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        gap: 14,
        minHeight: 110,
    },
    imageContainer: {
        width: 80,
        height: 80,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#F3F4F6',
    },
    image: {
        width: '100%',
        height: '100%',
    },
    imagePlaceholder: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
    },
    textContainer: {
        flex: 1,
        minWidth: 0,
        justifyContent: 'center',
    },
    question: {
        fontSize: 15,
        fontWeight: '600',
        color: Theme.textPrimary,
        lineHeight: 20,
    },
    answer: {
        fontSize: 14,
        color: Theme.textSecondary,
        marginTop: 6,
        lineHeight: 18,
    },
    oddsContainer: {
        justifyContent: 'center',
    },
    odds: {
        fontSize: 26,
        fontWeight: '800',
    },
    buttonsRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 28,
        marginTop: 24,
    },
    actionButton: {
        alignItems: 'center',
        gap: 6,
    },
    actionIcon: {
        width: 52,
        height: 52,
        borderRadius: 26,
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 3,
    },
    actionLabel: {
        fontSize: 12,
        fontWeight: '600',
        color: '#FFFFFF',
    },
});
