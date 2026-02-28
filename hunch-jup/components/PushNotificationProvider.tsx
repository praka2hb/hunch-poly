/**
 * PushNotificationProvider
 *
 * - Sets up notification response listener (tap → deep link)
 * - Registers push token when user logs in (backendUser set)
 * - Handles token refresh
 * - No permission prompt until after login
 */

import { api } from '@/lib/api';
import { registerForPushNotifications } from '@/lib/pushNotifications';
import { useUser } from '@/contexts/UserContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { router } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useEffect, useRef } from 'react';

const LAST_REGISTERED_TOKEN_KEY = 'push_last_registered_token';

async function getLastRegisteredToken(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(LAST_REGISTERED_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setLastRegisteredToken(token: string): Promise<void> {
  try {
    await AsyncStorage.setItem(LAST_REGISTERED_TOKEN_KEY, token);
  } catch {
    // Ignore storage errors
  }
}

async function clearLastRegisteredToken(): Promise<void> {
  try {
    await AsyncStorage.removeItem(LAST_REGISTERED_TOKEN_KEY);
  } catch {
    // Ignore
  }
}

export function PushNotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { backendUser } = useUser();
  const registrationInProgress = useRef(false);

  // Notification response listener (user tapped notification)
  useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as Record<
          string,
          unknown
        >;
        const type = data?.type as string | undefined;

        if (type === 'TRADE') {
          const tradeId = data?.tradeId as string | undefined;
          if (tradeId) {
            router.push(`/trade/${tradeId}` as any);
          }
        }
      }
    );

    return () => subscription.remove();
  }, []);

  // Handle notification received while app was quit (cold start)
  useEffect(() => {
    const response = Notifications.getLastNotificationResponse();
    if (!response) return;
    const data = response.notification.request.content.data as Record<
      string,
      unknown
    >;
    const type = data?.type as string | undefined;
    if (type === 'TRADE') {
      const tradeId = data?.tradeId as string | undefined;
      if (tradeId) {
        router.push(`/trade/${tradeId}` as any);
      }
    }
  }, []);

  // Register push token when user logs in
  useEffect(() => {
    if (!backendUser?.id) {
      return;
    }

    const register = async () => {
      if (registrationInProgress.current) return;
      registrationInProgress.current = true;

      try {
        const token = await registerForPushNotifications();
        if (!token) return;

        const lastToken = await getLastRegisteredToken();
        if (lastToken === token) {
          return; // Already registered this token
        }

        await api.registerPushToken(token);
        await setLastRegisteredToken(token);
      } catch (error) {
        console.error('[Push] Failed to register push token:', error);
      } finally {
        registrationInProgress.current = false;
      }
    };

    register();
  }, [backendUser?.id]);

  // Token refresh: re-register when device push token changes
  useEffect(() => {
    if (!backendUser?.id) return;

    const subscription = Notifications.addPushTokenListener(
      async (deviceToken) => {
        try {
          const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
          const expoToken = await Notifications.getExpoPushTokenAsync({
            projectId,
            devicePushToken: deviceToken,
          });
          const newToken = expoToken.data;
          const lastToken = await getLastRegisteredToken();
          if (lastToken === newToken) return;

          await api.registerPushToken(newToken);
          await setLastRegisteredToken(newToken);
        } catch (error) {
          console.error('[Push] Failed to refresh push token:', error);
        }
      }
    );

    return () => subscription.remove();
  }, [backendUser?.id]);

  // Clear stored token on logout
  useEffect(() => {
    if (!backendUser) {
      clearLastRegisteredToken();
    }
  }, [backendUser]);

  return <>{children}</>;
}
