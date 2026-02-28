import { BlurView } from "expo-blur";
import * as Haptics from "expo-haptics";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Image, Platform, StyleSheet, Text, View } from "react-native";

const appIcon = require("@/assets/images/icon.png");

interface FakeNotif {
  name: string;
  action: "bought" | "sold";
  side: "YES" | "NO";
  avatar?: string;
}

const FAKE_NOTIFICATIONS: FakeNotif[] = [
  { name: "vzy", action: "bought", side: "YES", avatar: "https://pbs.twimg.com/profile_images/1856732854781124608/Kg0v4Uwb_normal.jpg" },
  { name: "alex", action: "sold", side: "NO", avatar: "https://pbs.twimg.com/profile_images/1799582958685491200/kf3BLLFj_normal.jpg" },
  { name: "sarah", action: "bought", side: "YES", avatar: "https://pbs.twimg.com/profile_images/1767573060724482048/HCZzPLFr_normal.jpg" },
  { name: "mike", action: "bought", side: "YES" },
  { name: "jordan", action: "sold", side: "NO" },
  { name: "emma", action: "bought", side: "YES", avatar: "https://pbs.twimg.com/profile_images/1834195881164500992/mJ5rRfAy_normal.jpg" },
  { name: "dave", action: "sold", side: "NO" },
  { name: "lisa", action: "bought", side: "YES" },
];

const DISPLAY_DURATION = 2200;
const ANIM_DURATION = 280;
const STACK_MAX = 4;
const STACK_OFFSET_Y = 14;
const STACK_SCALE_STEP = 0.04;

let idCounter = 0;

export default function FakeNotificationStack() {
  const [stack, setStack] = useState<{ id: number; notif: FakeNotif }[]>(() => [
    { id: ++idCounter, notif: FAKE_NOTIFICATIONS[0] },
  ]);
  const nextIndexRef = useRef(1);
  const mountedRef = useRef(true);
  const entryAnimsRef = useRef<Map<number, { y: Animated.Value; opacity: Animated.Value }>>(new Map());

  const getEntryAnim = useCallback((id: number) => {
    if (!entryAnimsRef.current.has(id)) {
      entryAnimsRef.current.set(id, {
        y: new Animated.Value(-70),
        opacity: new Animated.Value(0),
      });
    }
    return entryAnimsRef.current.get(id)!;
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    const triggerHaptic = () => {
      if (mountedRef.current) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    };

    const addNext = () => {
      if (!mountedRef.current) return;
      const notif = FAKE_NOTIFICATIONS[nextIndexRef.current % FAKE_NOTIFICATIONS.length];
      nextIndexRef.current += 1;
      const id = ++idCounter;
      const { y, opacity } = getEntryAnim(id);
      y.setValue(-70);
      opacity.setValue(0);

      triggerHaptic();
      setStack((prev) => [{ id, notif }, ...prev].slice(0, STACK_MAX));

      Animated.parallel([
        Animated.spring(y, {
          toValue: 0,
          useNativeDriver: true,
          tension: 65,
          friction: 12,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: ANIM_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const t = setTimeout(addNext, DISPLAY_DURATION);
    const interval = setInterval(addNext, DISPLAY_DURATION);

    return () => {
      mountedRef.current = false;
      clearTimeout(t);
      clearInterval(interval);
      entryAnimsRef.current.forEach(({ y, opacity }) => {
        y.stopAnimation();
        opacity.stopAnimation();
      });
    };
  }, [getEntryAnim]);

  const notifContent = (notif: FakeNotif) => {
    const actionColor = notif.action === "bought" ? "#32de12" : "#FF10F0";
    const sideColor = notif.side === "YES" ? "#32de12" : "#FF10F0";

    return (
      <View style={styles.notifInner}>
        <View style={styles.avatarContainer}>
          <Image
            source={notif.avatar ? { uri: notif.avatar } : appIcon}
            style={styles.avatar}
          />
        </View>
        <View style={styles.textContainer}>
          <Text style={styles.notifText} numberOfLines={2}>
            <Text style={styles.nameText}>{notif.name}</Text>
            {" "}
            <Text style={{ color: actionColor, fontWeight: "700" }}>{notif.action}</Text>
            {" "}
            <Text style={{ color: sideColor, fontWeight: "800" }}>{notif.side}</Text>
          </Text>
        </View>
        <Text style={styles.timeText}>now</Text>
      </View>
    );
  };

  const renderNotification = (notif: FakeNotif) => {
    if (Platform.OS === "ios") {
      return (
        <BlurView intensity={25} tint="light" style={styles.notification}>
          <View style={styles.glassOverlay}>
            {notifContent(notif)}
          </View>
        </BlurView>
      );
    }
    return (
      <View style={[styles.notification, styles.androidFallback]}>
        {notifContent(notif)}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {stack.map(({ id, notif }, index) => {
        const scale = 1 - index * STACK_SCALE_STEP;
        const translateY = index * STACK_OFFSET_Y;
        const isNewest = index === 0;
        const entryAnim = isNewest ? getEntryAnim(id) : null;

        return (
          <Animated.View
            key={id}
            style={[
              styles.notificationWrapper,
              styles.stackedNotification,
              {
                zIndex: stack.length - index,
                transform: entryAnim
                  ? [
                      { translateY: Animated.add(entryAnim.y, translateY) },
                      { scale },
                    ]
                  : [{ translateY }, { scale }],
                opacity: entryAnim ? entryAnim.opacity : 1,
              },
            ]}
          >
            {renderNotification(notif)}
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 24,
    alignItems: "center",
    justifyContent: "flex-start",
    minHeight: 110,
  },
  notificationWrapper: {
    width: 340,
    borderRadius: 20,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(0, 0, 0, 0.15)",
  },
  stackedNotification: {
    position: "absolute",
    zIndex: -1,
  },
  notification: {
    borderRadius: 20,
    overflow: "hidden",
  },
  glassOverlay: {
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
    borderRadius: 20,
  },
  androidFallback: {
    backgroundColor: "rgba(255, 255, 255, 0.12)",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 0.5,
    borderColor: "rgba(255, 255, 255, 0.15)",
  },
  notifInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatarContainer: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.2)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.25)",
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  textContainer: {
    flex: 1,
  },
  nameText: {
    color: "#000",
    fontWeight: "700",
    fontSize: 15,
  },
  notifText: {
    fontSize: 15,
    fontWeight: "500",
    color: "rgba(0, 0, 0, 0.6)",
    lineHeight: 20,
  },
  timeText: {
    fontSize: 12,
    color: "rgba(0, 0, 0, 0.4)",
    fontWeight: "500",
  },
});
