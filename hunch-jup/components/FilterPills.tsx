import { Theme } from '@/constants/theme';
import * as Haptics from 'expo-haptics';
import { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

interface Category {
    id: string;
    slug: string;
    label: string;
}

interface FilterPillsProps {
    categories: Category[];
    selectedCategory: string;
    onCategoryChange: (category: string) => void;
    preferredCategories?: string[];
}

export const FilterPills = ({ categories, selectedCategory, onCategoryChange, preferredCategories = [] }: FilterPillsProps) => {
    const flatListRef = useRef<FlatList>(null);

    // Sort categories to show preferred ones first
    // Sort categories to show preferred ones first based on slug
    const sortedCategories = [...categories].sort((a, b) => {
        const aIsPreferred = preferredCategories.includes(a.slug);
        const bIsPreferred = preferredCategories.includes(b.slug);
        if (aIsPreferred && !bIsPreferred) return -1;
        if (!aIsPreferred && bIsPreferred) return 1;
        return 0;
    });

    const handlePress = useCallback((categorySlug: string, index: number) => {
        if (categorySlug !== selectedCategory) {
            Haptics.selectionAsync();
            onCategoryChange(categorySlug);
            // Scroll to make selected pill visible
            flatListRef.current?.scrollToIndex({
                index,
                animated: true,
                viewPosition: 0.3,
            });
        }
    }, [selectedCategory, onCategoryChange]);

    const renderPill = useCallback(({ item, index }: { item: Category; index: number }) => {
        const isSelected = item.slug === selectedCategory;
        // The API returns 'All' instead of 'all', but we want 'Hot' for the default feed
        const displayLabel = item.slug === 'all' ? 'Hot' : item.label;

        return (
            <TouchableOpacity
                onPress={() => handlePress(item.slug, index)}
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
                    {displayLabel}
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
                keyExtractor={(item) => item.slug}
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
