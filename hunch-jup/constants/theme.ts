/**
 * Minimal Black & White Theme with Clean Design
 * Pure monochrome with subtle accent for critical interactions
 */

import { Platform } from 'react-native';

// Minimal accent - used sparingly for critical actions only
const minimalAccent = '#000000'; // Dark black for primary actions

// Brand neons
export const NEON_GREEN = '#00e003';
export const NEON_PINK = '#FF10F0';

// Clean monochrome palette
export const Theme = {
  // Primary Colors
  accent: minimalAccent,
  accentSubtle: '#333333', // Subtle dark gray for secondary actions

  // Backgrounds - Clean whites and light grays
  bgMain: '#FFFFFF', // Pure white background
  bgCard: '#FAFAFA', // Very light gray for cards
  bgElevated: '#F5F5F5', // Light gray for elevated elements
  bgDark: '#000000', // Dark black for dark elements

  // Borders - Subtle and clean
  border: '#E5E5E5', // Light gray border
  borderLight: '#F0F0F0', // Very light border
  borderDark: '#D0D0D0', // Slightly darker border for emphasis

  // Text hierarchy - High contrast
  textPrimary: '#000000', // Dark black for primary text
  textSecondary: '#666666', // Medium gray for secondary text
  textDisabled: '#999999', // Light gray for disabled text
  textInverse: '#FFFFFF', // White text on dark backgrounds

  // State colors - Minimal and clean
  success: NEON_GREEN, // Neon green for success
  error: NEON_PINK, // Neon pink for errors
  warning: '#666666', // Gray for warnings

  // Component-specific - Subtle overlays
  accentMuted: 'rgba(0, 0, 0, 0.04)', // Very subtle black overlay
  accentLight: 'rgba(0, 0, 0, 0.08)', // Light black overlay
  accentMedium: 'rgba(0, 0, 0, 0.12)', // Medium black overlay

  // Special overlays
  overlay: 'rgba(0, 0, 0, 0.5)', // Modal overlay
  shadowColor: 'rgba(0, 0, 0, 0.1)', // Shadow color
  glassEffect: 'rgba(255, 255, 255, 0.9)', // Glass morphism effect

  // Legacy support - Monochrome versions
  successMuted: 'rgba(0, 224, 3, 0.08)', // Neon green muted
  errorMuted: 'rgba(255, 16, 240, 0.08)', // Neon pink muted

  // Chart colors - Vibrant palette for mini charts
  chartPositive: NEON_GREEN,       // Neon green for positive trends
  chartNegative: NEON_PINK,        // Neon pink for negative trends
  chartNeutral: NEON_GREEN,        // Neon green for neutral
  chartGradientStart: NEON_GREEN,  // Green gradient start
  chartGradientEnd: NEON_PINK,     // Pink gradient end
  chartLine: NEON_GREEN,           // Main line in green
  chartDot: NEON_GREEN,            // Data points in green
  chartBackground: 'rgba(0, 224, 3, 0.08)', // Subtle green background
};

export const Colors = {
  light: {
    text: '#11181C',
    background: '#fff',
    tint: '#0a7ea4',
    icon: '#687076',
    tabIconDefault: '#687076',
    tabIconSelected: '#0a7ea4',
  },
  dark: {
    text: Theme.textPrimary,
    background: Theme.bgMain,
    tint: Theme.accent,
    icon: Theme.textSecondary,
    tabIconDefault: Theme.textSecondary,
    tabIconSelected: Theme.accent,
  },
};

export const Fonts = {
  sans: Platform.select({
    ios: 'System', // iOS System Font
    default: 'Inter_400Regular', // Android/Web Inter
  }),
  serif: Platform.select({
    ios: 'Georgia',
    default: 'serif',
  }),
  rounded: Platform.select({
    ios: 'System',
    default: 'Inter_400Regular',
  }),
  mono: Platform.select({
    ios: 'Menlo',
    default: 'monospace',
  }),
};
