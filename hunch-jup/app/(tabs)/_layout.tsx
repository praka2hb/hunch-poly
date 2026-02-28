import { useUser } from "@/contexts/UserContext";
import { Ionicons } from "@expo/vector-icons";
import { usePrivy } from "@privy-io/expo";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { Tabs, useRouter, useSegments } from "expo-router";
import { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Dimensions, Easing, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Import theme
import { Theme } from "@/constants/theme";

// Tab configuration
const TAB_CONFIG = [
  { name: "index", title: "Home", icon: "home", iconOutline: "home-outline" },
  { name: "social", title: "Feed", icon: "people", iconOutline: "people-outline" },
  { name: "profile", title: "Profile", icon: "person", iconOutline: "person-outline" },
] as const;

const TAB_COUNT = TAB_CONFIG.length;
const NAVBAR_HORIZONTAL_MARGIN = 44; // symmetric outer margin
const NAVBAR_LEFT_MARGIN = NAVBAR_HORIZONTAL_MARGIN;
const NAVBAR_RIGHT_MARGIN = NAVBAR_HORIZONTAL_MARGIN;
const NAVBAR_HEIGHT = 72;
const NAVBAR_SCALE = 1.08;
const NAVBAR_WIDTH = Dimensions.get("window").width - NAVBAR_LEFT_MARGIN - NAVBAR_RIGHT_MARGIN;
const NAVBAR_INNER_HORIZONTAL_PADDING = 18; // equal padding left/right inside pill
const defaultProfileImage = require("@/assets/default.jpeg");
const homeIcon = require("@/assets/images/home.png");

/**
 * Custom bottom tab bar with sliding pill indicator.
 * All tabs show icon only (home, feed, profile).
 */
function CustomTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const { user } = usePrivy();

  // Get Twitter/X profile picture and remove _normal for higher resolution
  const twitterAccount = user?.linked_accounts?.find((a: any) => a.type === 'twitter_oauth');
  const rawProfileImageUrl = (twitterAccount as any)?.profile_picture_url;
  const profileImageUrl = rawProfileImageUrl?.replace('_normal', '');

  // Animate active tab index for smooth pill transitions
  const activeIndexAnim = useRef(new Animated.Value(state.index)).current;

  useEffect(() => {
    Animated.timing(activeIndexAnim, {
      toValue: state.index,
      duration: 260,
      useNativeDriver: false,
      easing: Easing.out(Easing.cubic),
    }).start();
  }, [state.index, activeIndexAnim]);

  // Each tab takes up an equal segment of the inner width
  const segmentWidthValue =
    (NAVBAR_WIDTH - NAVBAR_INNER_HORIZONTAL_PADDING * 2) / TAB_COUNT;
  const segmentWidth = new Animated.Value(segmentWidthValue);

  const baseCenterOffset =
    NAVBAR_INNER_HORIZONTAL_PADDING + (segmentWidthValue - 48) / 2;

  // Pill centered under the active tab (fixed 48px width)
  const activePillTranslateX = Animated.add(
    Animated.multiply(activeIndexAnim, segmentWidth),
    new Animated.Value(baseCenterOffset)
  );

  return (
    <View
      style={[
        styles.floatingContainer,
        {
          bottom: Math.max(insets.bottom, 0) + 4,
          transform: [{ scale: NAVBAR_SCALE }],
        },
      ]}
    >
      {/* Tab buttons */}
      <Animated.View
        style={[
          styles.tabsContainer,
          { paddingHorizontal: NAVBAR_INNER_HORIZONTAL_PADDING },
        ]}
      >
        {/* Sliding active pill */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.activePill,
            {
              left: 0,
              transform: [{ translateX: activePillTranslateX }],
            },
          ]}
        />
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;
          const tabConfig = TAB_CONFIG.find(t => t.name === route.name);

          const onPress = () => {
            const event = navigation.emit({
              type: "tabPress",
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: "tabLongPress",
              target: route.key,
            });
          };

          if (!tabConfig) return null;

          return (
            <TabButton
              key={route.key}
              focused={isFocused}
              iconName={tabConfig.icon}
              iconOutline={tabConfig.iconOutline}
              routeName={route.name}
              profileImageUrl={profileImageUrl}
              onPress={onPress}
              onLongPress={onLongPress}
            />
          );
        })}
      </Animated.View>
    </View>
  );
}

// Minimalist tab button (icon only for all tabs)
function TabButton({
  focused,
  iconName,
  iconOutline,
  routeName,
  profileImageUrl,
  onPress,
  onLongPress,
}: {
  focused: boolean;
  iconName: string;
  iconOutline: string;
  routeName: string;
  profileImageUrl?: string;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const handlePressIn = () => {
    if (process.env.EXPO_OS === 'ios') {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  };

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      style={styles.tabButton}
      android_ripple={null}
    >
      <View style={styles.iconWrapper}>
        {routeName === 'profile' ? (
          <Image
            source={profileImageUrl ? { uri: profileImageUrl } : defaultProfileImage}
            style={[styles.profileImage, focused && styles.profileImageActive]}
          />
        ) : routeName === 'index' ? (
          <Image
            source={homeIcon}
            style={[styles.homeIcon, { tintColor: focused ? Theme.textInverse : Theme.textSecondary }]}
            contentFit="contain"
          />
        ) : (
          <Ionicons
            name={routeName === 'social' ? (iconName as any) : (focused ? (iconName as any) : (iconOutline as any))}
            size={26}
            color={focused ? Theme.textInverse : Theme.textSecondary}
          />
        )}
      </View>
    </Pressable>
  );
}

export default function TabLayout() {
  const { isReady, user } = usePrivy();
  const { isDevMode } = useUser();
  const router = useRouter();
  const segments = useSegments();

  useEffect(() => {
    if (!isReady) return;

    const inTabs = segments[0] === '(tabs)';
    
    if (inTabs && !user && !isDevMode) {
      router.replace('/login');
    }
  }, [isReady, user, segments, isDevMode]);

  if (!isReady) {
    return (
      <View style={{ flex: 1, backgroundColor: Theme.bgMain, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color={Theme.textSecondary} />
      </View>
    );
  }

  if (!user && !isDevMode) {
    return null;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
      }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tabs.Screen name="index" options={{ title: "Home" }} />
      <Tabs.Screen name="social" options={{ title: "Feed" }} />
      <Tabs.Screen name="profile" options={{ title: "Profile" }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    left: NAVBAR_LEFT_MARGIN,
    right: NAVBAR_RIGHT_MARGIN,
    height: NAVBAR_HEIGHT,
    backgroundColor: Theme.bgMain,
    borderRadius: NAVBAR_HEIGHT / 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 12,
  },
  tabsContainer: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  activePill: {
    position: 'absolute',
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#000000',
  },
  iconWrapper: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
  homeIcon: {
    width: 26,
    height: 26,
  },
  profileImage: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    borderColor: Theme.textSecondary,
  },
  profileImageActive: {
    borderColor: Theme.textInverse,
  },
});