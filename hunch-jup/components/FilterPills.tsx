import { Theme } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface FilterPillsProps {
    categories: string[];
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    preferredCategories?: string[];
}

export const FilterPills = ({ categories, selectedCategory, onCategoryChange, preferredCategories = [] }: FilterPillsProps) => {
    const flatListRef = useRef<FlatList>(null);

    // Sort categories to show preferred ones first
    const sortedCategories = [...categories].sort((a, b) => {
        const aIsPreferred = preferredCategories.includes(a);
        const bIsPreferred = preferredCategories.includes(b);
        if (aIsPreferred && !bIsPreferred) return -1;
        if (!aIsPreferred && bIsPreferred) return 1;
        return 0;
    });

    const handlePress = useCallback((category: string, index: number) => {
        if (category !== selectedCategory) {
            Haptics.selectionAsync();
            onCategoryChange(category);
            // Scroll to make selected pill visible
            flatListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.3,
            });
        }
    }, [selectedCategory, onCategoryChange]);

    const renderPill = useCallback(({ item, index }: { item: string; index: number }) => {
        const isSelected = item === selectedCategory;
        // Show only the first word to avoid long labels
        const rawLabel = item === 'all' ? 'hot' : item.split(' ')[0];
        const label =
            rawLabel.length > 0
                ? rawLabel.charAt(0).toUpperCase() + rawLabel.slice(1).toLowerCase()
                : '';
        return (
            <TouchableOpacity
                onPress={() => handlePress(item, index)}
                activeOpacity={0.7}
                style={[
                    styles.pill,
                    isSelected ? styles.pillSelected : styles.pillUnselected,
                ]}
            >
                <Text
                    style={[
                        styles.pillText,
                        isSelected ? styles.pillTextSelected : styles.pillTextUnselected,
                    ]}
                >
                    {label}
                </Text>
            </TouchableOpacity>
        );
    }, [selectedCategory, handlePress]);

    return (
        <View style={styles.container}>
            <FlatList
                ref={flatListRef}
                horizontal
                data={sortedCategories}
                keyExtractor={(item) => item}
                renderItem={renderPill}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.contentContainer}
                onScrollToIndexFailed={() => {
                    // Fallback for scroll failures
                }}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        paddingVertical: 12,
    },
    contentContainer: {
        paddingHorizontal: 16,
        gap: 8,
        alignItems: 'center',
    },
    pill: {
        paddingHorizontal: 16,
        paddingVertical: 4,
        minHeight: 32,
        justifyContent: 'center',
    },
    pillSelected: {
        backgroundColor: 'transparent',
    },
    pillUnselected: {
        backgroundColor: 'transparent',
    },
    pillText: {},
    pillTextSelected: {
        color: Theme.textPrimary,
        fontSize: 22,
        fontWeight: '700',
        lineHeight: 28,
    },
    pillTextUnselected: {
        color: Theme.textSecondary,
        fontSize: 17,
        fontWeight: '400',
        lineHeight: 22,
    },
});
