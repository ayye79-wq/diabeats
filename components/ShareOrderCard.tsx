import React from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  Pressable,
  Share,
  ScrollView,
  Platform,
  useColorScheme,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import type { OrderStep } from "@/data/restaurants";

interface Props {
  visible: boolean;
  onClose: () => void;
  restaurantName: string;
  mealName: string;
  diabeticScore: "good" | "caution" | "avoid";
  orderSteps: OrderStep[];
}

const SCORE_CONFIG = {
  good: { label: "GOOD", bg: "#dcfce7", text: "#166534", icon: "checkmark-circle" as const },
  caution: { label: "CAUTION", bg: "#fef9c3", text: "#854d0e", icon: "warning" as const },
  avoid: { label: "AVOID", bg: "#fee2e2", text: "#991b1b", icon: "close-circle" as const },
};

function buildShareText(
  restaurantName: string,
  mealName: string,
  diabeticScore: string,
  steps: OrderStep[],
): string {
  const scoreLabel = diabeticScore.toUpperCase();
  const stepsText = steps
    .map((s, i) =>
      s.skip ? `✗ Skip: ${s.choice}` : `${i + 1}. ${s.label}: ${s.choice}`,
    )
    .join("\n");

  return [
    "DiabEats Order Card",
    "─────────────────────",
    `🏪 ${restaurantName}`,
    `🥘 ${mealName}`,
    `📊 Blood Sugar: ${scoreLabel}`,
    "",
    "How to build your order:",
    stepsText,
    "",
    "─────────────────────",
    "via DiabEats · diabeatsapp.com",
  ].join("\n");
}

export function ShareOrderCard({
  visible,
  onClose,
  restaurantName,
  mealName,
  diabeticScore,
  orderSteps,
}: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === "dark";
  const score = SCORE_CONFIG[diabeticScore];

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = buildShareText(restaurantName, mealName, diabeticScore, orderSteps);
    try {
      await Share.share({ message: text, title: `${mealName} — Order Card` });
    } catch {}
  };

  const handleCopy = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    const text = buildShareText(restaurantName, mealName, diabeticScore, orderSteps);
    Clipboard.setStringAsync(text);
  };

  const cardBg = isDark ? "#1a2e1f" : "#ffffff";
  const borderColor = isDark ? "#2d4a35" : "#e2f0e6";
  const textPrimary = isDark ? "#f0fdf4" : "#0a1f12";
  const textMuted = isDark ? "#86efac" : "#4b7a5a";
  const overlayBg = isDark ? "rgba(0,0,0,0.85)" : "rgba(0,0,0,0.6)";

  const buildSteps = orderSteps.filter((s) => !s.skip);
  const skipSteps = orderSteps.filter((s) => s.skip);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={[styles.overlay, { backgroundColor: overlayBg }]} onPress={onClose}>
        <Pressable style={styles.sheetWrapper} onPress={(e) => e.stopPropagation()}>
          <View style={[styles.sheet, { backgroundColor: isDark ? "#0f1f15" : "#f7fdf9" }]}>
            <View style={styles.handleRow}>
              <View style={[styles.handle, { backgroundColor: isDark ? "#3d6b4a" : "#c6e8d0" }]} />
              <Pressable onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <Ionicons name="close" size={20} color={textMuted} />
              </Pressable>
            </View>

            <Text style={[styles.sheetTitle, { color: textPrimary }]}>How to Order This</Text>
            <Text style={[styles.sheetSub, { color: textMuted }]}>
              DiabEats shows you what to customize. Place the order in DoorDash or the restaurant app.
            </Text>

            <ScrollView
              style={styles.cardScroll}
              contentContainerStyle={styles.cardScrollContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={[styles.card, { backgroundColor: cardBg, borderColor }]}>
                <View style={[styles.cardHeader, { borderBottomColor: borderColor }]}>
                  <View style={styles.cardRestaurantRow}>
                    <View style={[styles.cardIconWrap, { backgroundColor: score.bg }]}>
                      <Ionicons name={score.icon} size={16} color={score.text} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.cardRestaurant, { color: textMuted }]}>
                        {restaurantName}
                      </Text>
                      <Text style={[styles.cardMeal, { color: textPrimary }]} numberOfLines={2}>
                        {mealName}
                      </Text>
                    </View>
                    <View style={[styles.scorePill, { backgroundColor: score.bg }]}>
                      <Text style={[styles.scorePillText, { color: score.text }]}>
                        {score.label}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.cardBody}>
                  <Text style={[styles.buildLabel, { color: textMuted }]}>
                    Build this order · {buildSteps.length} steps
                  </Text>

                  {buildSteps.map((step, index) => (
                    <View
                      key={index}
                      style={[
                        styles.cardStep,
                        index < buildSteps.length - 1 && {
                          borderBottomWidth: 1,
                          borderBottomColor: borderColor,
                        },
                      ]}
                    >
                      <View
                        style={[
                          styles.cardStepBadge,
                          { backgroundColor: Colors.brand.primary + "15" },
                        ]}
                      >
                        <Text style={[styles.cardStepNum, { color: Colors.brand.primary }]}>
                          {index + 1}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.cardStepLabel, { color: textMuted }]}>
                          {step.label}
                        </Text>
                        <Text style={[styles.cardStepChoice, { color: textPrimary, fontFamily: "Inter_600SemiBold" }]}>
                          {step.choice}
                        </Text>
                      </View>
                      <Ionicons
                        name="checkmark-circle-outline"
                        size={18}
                        color={Colors.brand.primary + "40"}
                      />
                    </View>
                  ))}

                  {skipSteps.length > 0 && (
                    <View style={[styles.skipSection, { backgroundColor: Colors.brand.avoid + "0d", borderTopColor: borderColor }]}>
                      <View style={styles.skipHeader}>
                        <Ionicons name="ban-outline" size={13} color={Colors.brand.avoid} />
                        <Text style={[styles.skipHeaderText, { color: Colors.brand.avoid }]}>
                          SKIP / AVOID
                        </Text>
                      </View>
                      <View style={styles.skipChips}>
                        {skipSteps.map((step, index) => (
                          <View key={index} style={[styles.skipChip, { backgroundColor: Colors.brand.avoid + "15", borderColor: Colors.brand.avoid + "30" }]}>
                            <Ionicons name="close-circle" size={13} color={Colors.brand.avoid} />
                            <Text style={[styles.skipChipText, { color: Colors.brand.avoid }]}>
                              {step.choice}
                            </Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}
                </View>

                <View style={[styles.cardFooter, { borderTopColor: borderColor }]}>
                  <Text style={[styles.cardFooterText, { color: textMuted }]}>
                    via DiabEats · diabeatsapp.com
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.actionRow}>
              <Pressable
                onPress={handleShare}
                style={[styles.actionBtn, { backgroundColor: Colors.brand.primary }]}
                testID="share-order-card-btn"
              >
                <Ionicons name="share-outline" size={16} color="#fff" />
                <Text style={styles.actionBtnText}>Share</Text>
              </Pressable>

              <Pressable
                onPress={handleCopy}
                style={[styles.actionBtn, { backgroundColor: isDark ? "#1e3a28" : "#f0fdf4", borderWidth: 1, borderColor: Colors.brand.primary + "40" }]}
                testID="copy-order-card-btn"
              >
                <Ionicons name="copy-outline" size={16} color={Colors.brand.primary} />
                <Text style={[styles.actionBtnText, { color: Colors.brand.primary }]}>Copy</Text>
              </Pressable>
            </View>

          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  sheetWrapper: {
    width: "100%",
    maxWidth: 600,
    alignSelf: "center",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingBottom: Platform.OS === "web" ? 34 : 40,
    maxHeight: "92%",
  },
  handleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 12,
    paddingHorizontal: 16,
    marginBottom: 4,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    flex: 1,
    maxWidth: 36,
    alignSelf: "center",
  },
  closeBtn: {
    position: "absolute",
    right: 16,
    top: 8,
    padding: 4,
  },
  sheetTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 4,
    paddingHorizontal: 20,
  },
  sheetSub: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    textAlign: "center",
    marginBottom: 16,
    paddingHorizontal: 20,
  },
  cardScroll: {
    maxHeight: 380,
  },
  cardScrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: "hidden",
  },
  cardHeader: {
    padding: 16,
    borderBottomWidth: 1,
  },
  cardRestaurantRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  cardIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
  },
  cardRestaurant: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    marginBottom: 2,
  },
  cardMeal: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    lineHeight: 22,
  },
  scorePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    alignSelf: "flex-start",
    marginTop: 2,
  },
  scorePillText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.5,
  },
  cardBody: {
    padding: 16,
    paddingTop: 12,
  },
  buildLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 10,
  },
  cardStep: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
  },
  cardStepBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  cardStepNum: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
  },
  cardStepLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 1,
  },
  cardStepChoice: {
    fontSize: 14,
    lineHeight: 18,
  },
  skipSection: {
    marginTop: 12,
    borderTopWidth: 1,
    paddingTop: 12,
    borderRadius: 8,
    padding: 12,
  },
  skipHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 8,
  },
  skipHeaderText: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
  },
  skipChips: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  skipChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
  },
  skipChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
  cardFooter: {
    borderTopWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: "center",
  },
  cardFooterText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
  },
  actionRow: {
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 6,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
  },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
});
