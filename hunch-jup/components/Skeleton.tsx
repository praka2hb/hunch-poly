import { useEffect, useRef } from "react";
import { Animated, View } from "react-native";

interface SkeletonProps {
  className?: string;
  style?: object;
  width?: number | string;
  height?: number | string;
  borderRadius?: number;
}

export function Skeleton({
  className = "",
  style,
  width,
  height,
  borderRadius = 6,
}: SkeletonProps) {
  const opacity = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.75,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.4,
          duration: 800,
          useNativeDriver: true,
        }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [opacity]);

  return (
    <Animated.View
      className={`bg-slate-200 ${className}`}
      style={[
        {
          borderRadius,
          opacity,
          ...(width !== undefined && { width }),
          ...(height !== undefined && { height }),
        },
        style,
      ]}
    />
  );
}
