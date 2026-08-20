import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  Platform,
  useColorScheme,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { useSubscription, PaywallTrigger } from "@/context/SubscriptionContext";

const TRIGGER_COPY: Record<PaywallTrigger, { title: string; subtitle: string }> = {
  "ai-limit": {
    title: "You've used your free AI questions",
    subtitle: "Upgrade to ask unlimited questions about any meal or ingredient.",
  },
  "scan-limit": {
    title: "You've used your free menu scans",
    subtitle: "Upgrade to scan unlimited menus at any restaurant.",
  },
  "meal-analysis": {
    title: "Full AI Analysis is Premium",
    subtitle: "Get a complete breakdown of blood sugar impact, risks, and tips.",
  },
  "best-meal": {
    title: "Best Meal Picks are Premium",
    subtitle: "Let AI choose the safest, most diabetes-friendly meal for you.",
  },
  "meal-simulator": {
    title: "Blood Sugar Simulator is Premium",
    subtitle: "Customize ingredients and get a glucose prediction before you eat.",
  },
  "general": {
    title: "Upgrade to DiabEats Premium",
    subtitle: "Make smarter choices at every restaurant, every day.",
  },
};

const FEATURES = [
  { icon: "chatbubble-ellipses-outline", text: "Unlimited AI assistant questions" },
  { icon: "scan-outline", text: "Unlimited menu scanning" },
  { icon: "analytics-outline", text: "Full blood sugar impact analysis" },
  { icon: "star-outline", text: '"Best Meal" AI pick at any restaurant' },
  { icon: "flash-outline", text: "Personalized meal recommendations" },
  { icon: "heart-outline", text: "Saved meal profiles" },
];

export function PaywallModal() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const {
    paywallVisible,
    paywallTrigger,
    hidePaywall,
    purchaseMonthly,
    purchaseAnnual,
    restorePurchases,
  } = useSubscription();

  const [selectedPlan, setSelectedPlan] = useState<"monthly" | "annual">("annual");
  const [purchasing, setPurchasing] = useState(false);
  const { width } = useWindowDimensions();

  const copy = TRIGGER_COPY[paywallTrigger];
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;
  const maxContentWidth = Math.min(width, 540);
  const dismissPaywall = () => {
    setPurchasing(false);
    hidePaywall();
  };

  const handleSubscribe = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setPurchasing(true);
    try {
      if (selectedPlan === "monthly") {
        await purchaseMonthly();
      } else {
        await purchaseAnnual();
      }
    } catch (e: any) {
      const code = e.code != null ? ` (code ${e.code})` : "";
      Alert.alert("Purchase Failed", (e.message ?? "Something went wrong. Please try again.") + code);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setPurchasing(true);
    try {
      await restorePurchases();
    } finally {
      setPurchasing(false);
    }
  };

  return (
    <Modal
      visible={paywallVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={dismissPaywall}
      onDismiss={dismissPaywall}
    >
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <View style={styles.header}>
          <Pressable
            style={styles.closeBtn}
            onPress={dismissPaywall}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close upgrade options"
            testID="close-paywall"
          >
            <Ionicons name="close" size={22} color={c.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={{ width: maxContentWidth, alignSelf: "center" }}>
          <View style={styles.crownWrap}>
            <View style={[styles.crownCircle, { backgroundColor: Colors.brand.primary + "18" }]}>
              <Ionicons name="shield-checkmark" size={40} color={Colors.brand.primary} />
            </View>
          </View>

          <Text style={[styles.appTitle, { color: Colors.brand.primary }]}>DiabEats Premium</Text>

          <View style={[styles.trialBanner, { backgroundColor: Colors.brand.primary + "15", borderColor: Colors.brand.primary + "40" }]}>
            <Ionicons name="gift-outline" size={16} color={Colors.brand.primary} />
            <Text style={[styles.trialBannerText, { color: Colors.brand.primary }]}>Try free for 7 days — no charge until then</Text>
          </View>

          <Text style={[styles.triggerTitle, { color: c.textPrimary }]}>{copy.title}</Text>
          <Text style={[styles.triggerSubtitle, { color: c.textMuted }]}>{copy.subtitle}</Text>

          <View style={[styles.featureList, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            {FEATURES.map((f, i) => (
              <View key={i} style={[styles.featureRow, i < FEATURES.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                <View style={[styles.featureIcon, { backgroundColor: Colors.brand.primary + "15" }]}>
                  <Ionicons name={f.icon as any} size={18} color={Colors.brand.primary} />
                </View>
                <Text style={[styles.featureText, { color: c.textPrimary }]}>{f.text}</Text>
                <Ionicons name="checkmark" size={18} color={Colors.brand.primary} />
              </View>
            ))}
          </View>

          <View style={styles.plansRow}>
            <Pressable
              style={[
                styles.planCard,
                { borderColor: selectedPlan === "monthly" ? Colors.brand.primary : c.border, backgroundColor: c.cardBg },
                selectedPlan === "monthly" && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan("monthly")}
            >
              {selectedPlan === "monthly" && (
                <View style={[styles.planDot, { backgroundColor: Colors.brand.primary }]} />
              )}
              <Text style={[styles.planLabel, { color: c.textMuted }]}>Monthly</Text>
              <Text style={[styles.planPrice, { color: c.textPrimary }]}>$6.99</Text>
              <Text style={[styles.planPeriod, { color: c.textMuted }]}>per month</Text>
            </Pressable>

            <Pressable
              style={[
                styles.planCard,
                { borderColor: selectedPlan === "annual" ? Colors.brand.primary : c.border, backgroundColor: c.cardBg },
                selectedPlan === "annual" && styles.planCardSelected,
              ]}
              onPress={() => setSelectedPlan("annual")}
            >
              <View style={[styles.saveBadge, { backgroundColor: Colors.brand.primary }]}>
                <Text style={styles.saveBadgeText}>Save 30%</Text>
              </View>
              {selectedPlan === "annual" && (
                <View style={[styles.planDot, { backgroundColor: Colors.brand.primary }]} />
              )}
              <Text style={[styles.planLabel, { color: c.textMuted }]}>Annual</Text>
              <Text style={[styles.planPrice, { color: c.textPrimary }]}>$59.99</Text>
              <Text style={[styles.planPeriod, { color: c.textMuted }]}>per year</Text>
              <Text style={[styles.planEquiv, { color: Colors.brand.primary }]}>$5.00/mo</Text>
            </Pressable>
          </View>

          <Pressable
            style={[styles.subscribeBtn, { backgroundColor: Colors.brand.primary }, purchasing && styles.subscribeBtnDisabled]}
            onPress={handleSubscribe}
            disabled={purchasing}
          >
            {purchasing ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <Ionicons name="gift-outline" size={18} color="#fff" style={{ marginRight: 8 }} />
                <Text style={styles.subscribeBtnText}>
                  Start 7-Day Free Trial
                </Text>
              </>
            )}
          </Pressable>

          <Text style={[styles.trialNote, { color: c.textMuted }]}>
            {selectedPlan === "monthly"
              ? "Free for 7 days, then $6.99/month. Cancel anytime."
              : "Free for 7 days, then $59.99/year ($5.00/mo). Cancel anytime."}
          </Text>

          <Pressable style={styles.restoreBtn} onPress={handleRestore} disabled={purchasing}>
            <Text style={[styles.restoreText, { color: c.textMuted }]}>Restore Purchase</Text>
          </Pressable>

          <Pressable
            style={styles.continueBtn}
            onPress={dismissPaywall}
            accessibilityRole="button"
            accessibilityLabel="Continue with the free plan"
          >
            <Text style={[styles.continueText, { color: c.textMuted }]}>Continue with Free Plan</Text>
          </Pressable>

          <View style={styles.legalRow}>
            <Pressable onPress={() => Linking.openURL("https://diabeatsapp.com/privacy")}>
              <Text style={[styles.legalLink, { color: c.textMuted }]}>Privacy Policy</Text>
            </Pressable>
            <Text style={[styles.legalSep, { color: c.textMuted }]}> · </Text>
            <Pressable onPress={() => Linking.openURL("https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")}>
              <Text style={[styles.legalLink, { color: c.textMuted }]}>Terms of Use</Text>
            </Pressable>
          </View>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 4,
  },
  closeBtn: {
    padding: 6,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    alignItems: "center",
  },
  crownWrap: {
    marginBottom: 16,
  },
  crownCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
  },
  appTitle: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
    marginBottom: 10,
    letterSpacing: -0.3,
  },
  triggerTitle: {
    fontSize: 18,
    fontFamily: "Inter_600SemiBold",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 26,
  },
  triggerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    textAlign: "center",
    marginBottom: 24,
    lineHeight: 20,
  },
  featureList: {
    width: "100%",
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
    marginBottom: 24,
  },
  featureRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 13,
    gap: 12,
  },
  featureIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    lineHeight: 18,
  },
  plansRow: {
    flexDirection: "row",
    gap: 12,
    width: "100%",
    marginBottom: 20,
  },
  planCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 2,
    padding: 16,
    alignItems: "center",
    position: "relative",
  },
  planCardSelected: {
    borderWidth: 2,
  },
  planDot: {
    position: "absolute",
    top: 10,
    right: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  saveBadge: {
    position: "absolute",
    top: -10,
    borderRadius: 20,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  saveBadgeText: {
    color: "#fff",
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
  },
  planLabel: {
    fontSize: 12,
    fontFamily: "Inter_500Medium",
    marginBottom: 4,
    marginTop: 8,
  },
  planPrice: {
    fontSize: 26,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
  },
  planPeriod: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginTop: 2,
  },
  planEquiv: {
    fontSize: 12,
    fontFamily: "Inter_600SemiBold",
    marginTop: 4,
  },
  subscribeBtn: {
    width: "100%",
    borderRadius: 14,
    height: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  subscribeBtnDisabled: {
    opacity: 0.7,
  },
  subscribeBtnText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter_600SemiBold",
    letterSpacing: -0.2,
  },
  trialBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginBottom: 18,
    alignSelf: "stretch",
  },
  trialBannerText: {
    fontSize: 13,
    fontFamily: "Inter_600SemiBold",
    flex: 1,
  },
  trialNote: {
    fontSize: 12,
    fontFamily: "Inter_400Regular",
    marginBottom: 20,
    textAlign: "center",
  },
  restoreBtn: {
    paddingVertical: 8,
    marginBottom: 4,
  },
  restoreText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
  continueBtn: {
    paddingVertical: 8,
  },
  continueText: {
    fontSize: 13,
    fontFamily: "Inter_400Regular",
  },
  legalRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    marginBottom: 8,
  },
  legalLink: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
    textDecorationLine: "underline",
  },
  legalSep: {
    fontSize: 11,
    fontFamily: "Inter_400Regular",
  },
});
