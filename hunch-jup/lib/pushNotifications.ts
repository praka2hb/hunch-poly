/**
 * Production-ready push notifications for Hunch
 * - Permission requested only after login
 * - Expo Push Token registration with backend
 * - Deep link handling for TRADE notifications
 * - Foreground notification display
 * - Token refresh handling
 * - EAS Build compatible (requires expo-notifications plugin)
 */

import Constants from 'expo-constants';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Notification data types from backend
export interface TradeNotificationData {
  type: 'TRADE';
  tradeId: string;
  [key: string]: unknown;
}

export type NotificationData = TradeNotificationData;

// Configure how notifications are presented when app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldAnimate: true,
  }),
});

/**
 * Get the EAS project ID for push token (required for EAS builds)
 */
function getProjectId(): string | undefined {
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  return projectId;
}

/**
 * Check if we're on a physical device (push not supported on simulators)
 */
function isPhysicalDevice(): boolean {
  return Platform.OS === 'web' ? false : Device.isDevice;
}

/**
 * Request notification permissions.
 * Only prompts if not yet determined; avoids duplicate prompts.
 * Returns status without re-prompting if already denied/blocked.
 */
export async function requestNotificationPermissions(): Promise<Notifications.PermissionStatus> {
  if (!isPhysicalDevice()) {
    return Notifications.PermissionStatus.UNDETERMINED;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();

  if (existingStatus === Notifications.PermissionStatus.GRANTED) {
    return existingStatus;
  }

  if (existingStatus === Notifications.PermissionStatus.DENIED) {
    // User previously denied - don't prompt again
    return existingStatus;
  }

  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });

  return status;
}

/**
 * Get current permission status without prompting
 */
export async function getPermissionStatus(): Promise<Notifications.PermissionStatus> {
  const { status } = await Notifications.getPermissionsAsync();
  return status;
}

/**
 * Generate Expo Push Token.
 * Requires projectId for EAS builds. Safe to call multiple times.
 */
export async function getExpoPushToken(): Promise<string | null> {
  if (!isPhysicalDevice()) return null;

  const projectId = getProjectId();
  if (!projectId) {
    console.warn('[Push] EAS projectId not found - push tokens may not work in production');
  }

  try {
    const token = await Notifications.getExpoPushTokenAsync({
      projectId: projectId ?? undefined,
    });
    return token.data;
  } catch (error) {
    console.error('[Push] Failed to get Expo Push Token:', error);
    return null;
  }
}

/**
 * Register for push notifications and return the token if permission granted.
 * Call this only after user has logged in.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  const status = await requestNotificationPermissions();
  if (status !== Notifications.PermissionStatus.GRANTED) {
    return null;
  }
  return getExpoPushToken();
}
