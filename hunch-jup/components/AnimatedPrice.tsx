import { Theme } from '@/constants/theme';
import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, TextStyle, View } from 'react-native';

interface AnimatedPriceProps {
    value: number;
    format: 'cents' | 'percent' | 'decimal';
    style?: TextStyle;
    animationDuration?: number;
    showSign?: boolean;
}

/**
 * AnimatedPrice - Scoreboard-style animated number display
 * Animates each digit individually with smooth transitions
 */
export const AnimatedPrice: React.FC<AnimatedPriceProps> = ({
    value,
    format,
    style,
    animationDuration = 300,
    showSign = false,
}) => {
    const animatedValue = useRef(new Animated.Value(value)).current;
    const previousValue = useRef(value);

    useEffect(() => {
        if (previousValue.current !== value) {
            Animated.spring(animatedValue, {
                toValue: value,
                useNativeDriver: false,
                tension: 100,
                friction: 10,
            }).start();
            previousValue.current = value;
        }
    }, [value, animatedValue]);

    // Format the display value
    const formatValue = (val: number): string => {
        switch (format) {
            case 'cents':
                // Convert decimal to cents (0.36 -> 36¢)
                const cents = Math.round(val * 100);
                return `${cents}¢`;
            case 'percent':
                // Convert decimal to percentage (0.36 -> 36%)
                const pct = Math.round(val * 100);
                return `${pct}%`;
            case 'decimal':
            default:
                return val.toFixed(2);
        }
    };

    // Get sign for display
    const getSign = (): string => {
        if (!showSign) return '';
        return value >= 0 ? '+' : '';
    };

    // Determine color based on value change direction
    const getColor = (): string => {
        if (value > previousValue.current) {
            return '#32de12';
        } else if (value < previousValue.current) {
            return Theme.chartNegative;
        }
        return style?.color as string || Theme.textPrimary;
    };

    return (
        <View style={styles.container}>
            <Animated.Text
                style={[
                    styles.priceText,
                    style,
                    {
                        transform: [{
                            scale: animatedValue.interpolate({
                                inputRange: [value - 0.1, value, value + 0.1],
                                outputRange: [0.95, 1, 1.05],
                                extrapolate: 'clamp',
                            }),
                        }],
                    },
                ]}
            >
                {getSign()}{formatValue(value)}
            </Animated.Text>
        </View>
    );
};

/**
 * AnimatedDigit - Single digit with flip animation
 */
interface AnimatedDigitProps {
    digit: string;
    style?: TextStyle;
}

export const AnimatedDigit: React.FC<AnimatedDigitProps> = ({ digit, style }) => {
    const flipAnim = useRef(new Animated.Value(0)).current;
    const previousDigit = useRef(digit);

    useEffect(() => {
        if (previousDigit.current !== digit) {
            // Animate flip
            flipAnim.setValue(0);
            Animated.sequence([
                Animated.timing(flipAnim, {
                    toValue: 1,
                    duration: 150,
                    useNativeDriver: true,
                }),
            ]).start();
            previousDigit.current = digit;
        }
    }, [digit, flipAnim]);

    return (
        <Animated.Text
            style={[
                styles.digit,
                style,
                {
                    transform: [{
                        rotateX: flipAnim.interpolate({
                            inputRange: [0, 0.5, 1],
                            outputRange: ['0deg', '-90deg', '0deg'],
                        }),
                    }],
                    opacity: flipAnim.interpolate({
                        inputRange: [0, 0.3, 0.7, 1],
                        outputRange: [1, 0.5, 0.5, 1],
                    }),
                },
            ]}
        >
            {digit}
        </Animated.Text>
    );
};

/**
 * ScoreboardPrice - Full scoreboard with individual digit animations
 */
interface ScoreboardPriceProps {
    value: number;
    suffix?: string;
    containerStyle?: object;
    digitStyle?: TextStyle;
}

export const ScoreboardPrice: React.FC<ScoreboardPriceProps> = ({
    value,
    suffix = '¢',
    containerStyle,
    digitStyle,
}) => {
    // Convert to display value (cents)
    const displayValue = Math.round(value * 100);
    const digits = displayValue.toString().split('');

    return (
        <View style={[styles.scoreboardContainer, containerStyle]}>
            {digits.map((digit, index) => (
                <View key={`digit-${index}`} style={styles.digitContainer}>
                    <AnimatedDigit digit={digit} style={digitStyle} />
                </View>
            ))}
            <Text style={[styles.suffix, digitStyle]}>{suffix}</Text>
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    priceText: {
        fontSize: 24,
        fontWeight: '700',
        color: Theme.textPrimary,
    },
    scoreboardContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    digitContainer: {
        backgroundColor: Theme.bgElevated,
        borderRadius: 4,
        paddingHorizontal: 6,
        paddingVertical: 2,
        marginHorizontal: 1,
        minWidth: 24,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        borderColor: Theme.border,
    },
    digit: {
        fontSize: 20,
        fontWeight: '700',
        color: Theme.textPrimary,
        fontVariant: ['tabular-nums'],
    },
    suffix: {
        fontSize: 16,
        fontWeight: '600',
        color: Theme.textSecondary,
        marginLeft: 2,
    },
});

export default AnimatedPrice;
