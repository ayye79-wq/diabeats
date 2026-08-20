import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";

type Score = "good" | "caution" | "avoid";

interface Props {
  score: Score;
  size?: "sm" | "md";
}

const CONFIG: Record<Score, { label: string; icon: string; bg: string; text: string; border: string }> = {
  good: {
    label: "Better Choice",
    icon: "checkmark-circle",
    bg: Colors.brand.goodLight,
    text: Colors.brand.goodText,
    border: Colors.brand.good,
  },
  caution: {
    label: "Use Caution",
    icon: "warning",
    bg: Colors.brand.cautionLight,
    text: Colors.brand.cautionText,
    border: Colors.brand.caution,
  },
  avoid: {
    label: "Limit or Avoid",
    icon: "close-circle",
    bg: Colors.brand.avoidLight,
    text: Colors.brand.avoidText,
    border: Colors.brand.avoid,
  },
};

export function ScoreTag({ score, size = "md" }: Props) {
  const cfg = CONFIG[score];
  const isSmall = size === "sm";

  return (
    <View
      style={[
        styles.tag,
        {
          backgroundColor: cfg.bg,
          borderColor: cfg.border,
          paddingHorizontal: isSmall ? 8 : 12,
          paddingVertical: isSmall ? 4 : 6,
          borderRadius: isSmall ? 8 : 12,
        },
      ]}
    >
      <Ionicons
        name={cfg.icon as any}
        size={isSmall ? 12 : 14}
        color={cfg.text}
        style={{ marginRight: 4 }}
      />
      <Text
        style={[
          styles.label,
          {
            color: cfg.text,
            fontSize: isSmall ? 11 : 13,
          },
        ]}
      >
        {cfg.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    alignSelf: "flex-start",
  },
  label: {
    fontFamily: "Inter_600SemiBold",
  },
});
