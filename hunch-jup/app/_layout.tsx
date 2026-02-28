import { Buffer } from 'buffer';
import 'react-native-get-random-values';
import "../global.css";

global.Buffer = Buffer;

import {
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
} from '@expo-google-fonts/inter';
import { PrivyProvider } from '@privy-io/expo';
import { PrivyElements } from '@privy-io/expo/ui';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import Constants from 'expo-constants';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { Platform, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { AuthInitializer } from '@/components/AuthInitializer';
import { PushNotificationProvider } from '@/components/PushNotificationProvider';
import { UserProvider, useUser } from '@/contexts/UserContext';
import { useColorScheme } from '@/hooks/use-color-scheme';
import '@/lib/pushNotifications'; // Sets up setNotificationHandler at app root
import { OnboardingStep } from '@/lib/types';
import { usePrivy } from '@privy-io/expo';

SplashScreen.preventAutoHideAsync();

export const unstable_settings = {
  initialRouteName: 'login',
};

// Onboarding step order for forward-only navigation
const ONBOARDING_ORDER: OnboardingStep[] = ['LINK_X', 'USERNAME', 'INTERESTS', 'SUGGESTED_FOLLOWERS', 'COMPLETE'];

function getStepIndex(step?: OnboardingStep): number {
  if (!step) return 0;
  const idx = ONBOARDING_ORDER.indexOf(step);
  return idx === -1 ? 0 : idx;
}

function getRouteForStep(step: OnboardingStep, hasTwitterLinked?: boolean): string {
  switch (step) {
    case 'LINK_X':
      // Twitter users already have X linked — skip to username
      return hasTwitterLinked ? '/onboarding/username' : '/onboarding/link-x';
    case 'USERNAME':
      return '/onboarding/username';
    case 'INTERESTS':
      return '/preferences';
    case 'SUGGESTED_FOLLOWERS':
      return '/suggested-followers';
    case 'COMPLETE':
    default:
      return '/(tabs)';
  }
}

function getStepForRoute(route: string): OnboardingStep | null {
  if (route.includes('link-x')) return 'LINK_X';
  if (route.includes('username')) return 'USERNAME';
  if (route.includes('preferences')) return 'INTERESTS';
  if (route.includes('suggested-followers')) return 'SUGGESTED_FOLLOWERS';
  if (route.includes('(tabs)')) return 'COMPLETE';
  return null;
}

function AuthFlowGate() {
  const router = useRouter();
  const segments = useSegments();
  const { isReady, user } = usePrivy();
  const { backendUser, isLoading: isBackendUserLoading, isDevMode } = useUser();

  useEffect(() => {
    if (!isReady || isBackendUserLoading) return;

    const root = segments[0];
    const inLogin = root === 'login';
    const inTabs = root === '(tabs)';
    const inOnboarding =
      root === 'onboarding' || root === 'preferences' || root === 'suggested-followers';
    const currentPath = `/${segments.join('/')}`;

    // Dev mode bypass: skip Privy check, go straight to tabs if backend user exists
    if (isDevMode && backendUser) {
      if (inLogin || inOnboarding) {
        router.replace('/(tabs)');
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 1: Not authenticated → must be on login (unless still loading)
    // ─────────────────────────────────────────────────────────────────────────
    if (!user) {
      if (!inLogin) {
        router.replace('/login');
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 2: Authenticated but no backend user yet → stay on login to sync
    // ─────────────────────────────────────────────────────────────────────────
    if (!backendUser) {
      if (!inLogin) {
        router.replace('/login');
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 3: Onboarding complete → go to tabs (from login or onboarding)
    // ─────────────────────────────────────────────────────────────────────────
    if (backendUser.hasCompletedOnboarding) {
      if (inLogin || inOnboarding) {
        router.replace('/(tabs)');
      }
      return;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RULE 4: Onboarding NOT complete → enforce forward-only navigation
    // ─────────────────────────────────────────────────────────────────────────
    const hasTwitterLinked = Boolean(
      user.linked_accounts?.some((a: any) => a.type === 'twitter_oauth')
    );

    const backendStep = (backendUser.onboardingStep as OnboardingStep) || 'LINK_X';
    const targetRoute = getRouteForStep(backendStep, hasTwitterLinked);
    const targetStepIndex = getStepIndex(backendStep);

    // From login, always navigate to the correct onboarding step
    if (inLogin) {
      router.replace(targetRoute as any);
      return;
    }

    // From tabs (shouldn't happen during onboarding), redirect to correct step
    if (inTabs) {
      router.replace(targetRoute as any);
      return;
    }

    // In onboarding: only redirect if user is trying to go BACKWARD
    // Allow staying on current screen or going forward (screens handle forward nav)
    if (inOnboarding) {
      const currentStep = getStepForRoute(currentPath);
      const currentStepIndex = currentStep ? getStepIndex(currentStep) : -1;

      // If current route is BEHIND the backend step, redirect forward
      // This prevents going back to link-x from username, etc.
      if (currentStepIndex < targetStepIndex) {
        router.replace(targetRoute as any);
        return;
      }
      // Otherwise, let the user stay on current screen (forward navigation is allowed)
    }
  }, [isReady, isBackendUserLoading, user, backendUser, segments]);

  return null;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();

  // Load Inter fonts for Android/Web (avoid loading system fonts for iOS)
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();

      // Set global default font for all Text components based on Platform
      // iOS: undefined (System). Android/Web: Inter.
      const TextComponent = Text as any;
      if (!TextComponent.defaultProps) {
        TextComponent.defaultProps = {};
      }
      const defaultStyle = TextComponent.defaultProps.style || {};

      const fontFamily = Platform.select({
        ios: undefined,
        default: 'Inter_400Regular',
      });

      // Only apply fontFamily if it's defined (i.e., not iOS)
      if (fontFamily) {
        TextComponent.defaultProps.style = Array.isArray(defaultStyle)
          ? [...defaultStyle, { fontFamily }]
          : [defaultStyle, { fontFamily }];
      }
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <PrivyProvider
      appId={Constants.expoConfig?.extra?.privyAppId}
      clientId={Constants.expoConfig?.extra?.privyClientId}
      config={{
        embedded: {
          solana: {
            createOnLogin: 'users-without-wallets'
          }
        }
      }}
    >
      <AuthInitializer>
        <UserProvider>
          <PushNotificationProvider>
          <AuthFlowGate />
          <GestureHandlerRootView style={{ flex: 1 }}>
            <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
              <Stack screenOptions={{ headerShown: false }}>
                <Stack.Screen name="login" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding/link-x" options={{ headerShown: false }} />
                <Stack.Screen name="onboarding/username" options={{ headerShown: false }} />
                <Stack.Screen name="preferences" options={{ headerShown: false }} />
                <Stack.Screen name="suggested-followers" options={{ headerShown: false }} />
                <Stack.Screen
                  name="event/[ticker]"
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
                <Stack.Screen
                  name="market/[ticker]"
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
                <Stack.Screen
                  name="user/[userId]"
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
                <Stack.Screen
                  name="user/followers/[userId]"
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
                <Stack.Screen
                  name="trade/[tradeId]"
                  options={{
                    headerShown: false,
                    presentation: 'card',
                  }}
                />
                <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
              </Stack>
              <StatusBar style="auto" />
            </ThemeProvider>
          </GestureHandlerRootView>
          <PrivyElements />
          </PushNotificationProvider>
        </UserProvider>
      </AuthInitializer>
    </PrivyProvider>
  );
}
