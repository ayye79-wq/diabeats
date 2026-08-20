import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { RESTAURANTS } from "@/data/restaurants";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/context/SubscriptionContext";
import { simulationResultSchema } from "@/shared/ai-safety";

interface Component {
  id: string;
  label: string;
  active: boolean;
  isAddOn?: boolean;
}

type SimulationResult = ReturnType<typeof simulationResultSchema.parse>;

function extractComponents(meal: {
  name: string;
  description: string;
  orderSteps?: { label: string; choice: string; skip?: boolean }[];
}): Component[] {
  if (meal.orderSteps && meal.orderSteps.length > 0) {
    return meal.orderSteps
      .filter((s) => !s.skip)
      .map((s, i) => ({
        id: `step-${i}`,
        label: s.choice,
        active: true,
      }));
  }
  const parts = meal.description
    .split(/[,.]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 40)
    .slice(0, 8);
  return parts.map((p, i) => ({
    id: `part-${i}`,
    label: p.charAt(0).toUpperCase() + p.slice(1),
    active: true,
  }));
}

const ADD_ONS: { id: string; label: string }[] = [
  { id: "ao-1", label: "Extra protein" },
  { id: "ao-2", label: "White rice" },
  { id: "ao-3", label: "Brown rice" },
  { id: "ao-4", label: "Tortilla / wrap" },
  { id: "ao-5", label: "Cheese" },
  { id: "ao-6", label: "Sour cream" },
  { id: "ao-7", label: "Guacamole" },
  { id: "ao-8", label: "Dressing" },
];

const IMPACT_CONFIG = {
  low: { label: "LOW IMPACT", bg: "#dcfce7", text: "#15803d", border: "#bbf7d0" },
  moderate: { label: "MODERATE IMPACT", bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
  high: { label: "HIGH IMPACT", bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
};

const CONFIDENCE_LABEL = { low: "Low confidence", medium: "Medium confidence", high: "High confidence" };

export default function MealSimulatorScreen() {
  const { restaurantId, itemId } = useLocalSearchParams<{ restaurantId: string; itemId: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const { isPremium, showPaywall } = useSubscription();

  const restaurant = useMemo(
    () => RESTAURANTS.find((r) => r.id === restaurantId),
    [restaurantId]
  );
  const meal = useMemo(
    () => restaurant?.menuItems.find((m) => m.id === itemId),
    [restaurant, itemId]
  );

  const baseComponents = useMemo(
    () => (meal ? extractComponents(meal) : []),
    [meal]
  );

  const [components, setComponents] = useState<Component[]>(baseComponents);
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleComponent = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComponents((prev) =>
      prev.map((c) => (c.id === id ? { ...c, active: !c.active } : c))
    );
    setResult(null);
  }, []);

  const toggleAddOn = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setResult(null);
  }, []);

  const runSimulation = useCallback(async () => {
    if (!meal || !restaurant) return;
    if (!isPremium) {
      showPaywall("meal-simulator");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const selected = components.filter((c) => c.active).map((c) => c.label);
      const removed = components.filter((c) => !c.active).map((c) => c.label);
      const extras = ADD_ONS.filter((a) => addOns.has(a.id)).map((a) => a.label);
      const res = await apiRequest("POST", "/api/simulate-impact", {
        restaurantName: restaurant.name,
        mealName: meal.name,
        nutrients: meal.nutrients,
        carbRange: meal.carbRange,
        selectedComponents: [...selected, ...extras],
        removedComponents: removed,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const validated = simulationResultSchema.safeParse(data);
      if (!validated.success) throw new Error("The meal comparison was incomplete.");
      setResult(validated.data);
    } catch {
      setError("Simulation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [meal, restaurant, isPremium, showPaywall, components, addOns]);

  if (!meal || !restaurant) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Text style={[styles.errorText, { color: c.textMuted }]}>Meal not found</Text>
      </View>
    );
  }

  const impact = result ? IMPACT_CONFIG[result.impactLevel] : null;
  const activeCount = components.filter((c) => c.active).length + addOns.size;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 6 }]}>
        <View style={styles.headerRow}>
          <View style={styles.iconWrap}>
            <Ionicons name="pulse" size={18} color={Colors.brand.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Meal Impact Explorer</Text>
            <Text style={[styles.headerSub, { color: c.textMuted }]}>Compare food patterns—not a glucose prediction</Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="close-simulator">
            <Ionicons name="close" size={22} color={c.textMuted} />
          </Pressable>
        </View>

        <View style={[styles.mealPill, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Text style={[styles.mealPillName, { color: c.textPrimary }]} numberOfLines={1}>
            {meal.name}
          </Text>
          <Text style={[styles.mealPillRestaurant, { color: c.textMuted }]}>
            {restaurant.name} · {meal.carbRange}
          </Text>
        </View>
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.sectionLabel, { color: c.textMuted }]}>WHAT’S IN IT</Text>
        <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
          Deselect anything you won’t be eating
        </Text>
        <View style={styles.chips}>
          {components.map((comp) => (
            <Pressable
              key={comp.id}
              onPress={() => toggleComponent(comp.id)}
              style={[
                styles.chip,
                comp.active
                  ? { backgroundColor: Colors.brand.primary + "18", borderColor: Colors.brand.primary + "50" }
                  : { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
              testID={`component-chip-${comp.id}`}
            >
              {comp.active ? (
                <Ionicons name="checkmark-circle" size={14} color={Colors.brand.primary} />
              ) : (
                <Ionicons name="close-circle" size={14} color={c.textMuted} />
              )}
              <Text
                style={[
                  styles.chipLabel,
                  { color: comp.active ? Colors.brand.primary : c.textMuted },
                ]}
              >
                {comp.label}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>ADD TO MEAL</Text>
        <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
          Tap to add extras to the simulation
        </Text>
        <View style={styles.chips}>
          {ADD_ONS.map((ao) => {
            const isActive = addOns.has(ao.id);
            return (
              <Pressable
                key={ao.id}
                onPress={() => toggleAddOn(ao.id)}
                style={[
                  styles.chip,
                  isActive
                    ? { backgroundColor: "#fef9c3", borderColor: "#fde047" }
                    : { backgroundColor: c.cardBg, borderColor: c.border },
                ]}
                testID={`addon-chip-${ao.id}`}
              >
                <Ionicons name={isActive ? "add-circle" : "add-circle-outline"} size={14} color={isActive ? "#854d0e" : c.textMuted} />
                <Text style={[styles.chipLabel, { color: isActive ? "#854d0e" : c.textSecondary }]}>
                  {ao.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <View style={[styles.summaryRow, { borderColor: c.border }]}>
          <Ionicons name="list-outline" size={14} color={c.textMuted} />
          <Text style={[styles.summaryText, { color: c.textMuted }]}>
            {activeCount} ingredient{activeCount !== 1 ? "s" : ""} selected
          </Text>
        </View>

        <Pressable
          onPress={runSimulation}
          disabled={loading || activeCount === 0}
          style={({ pressed }) => [
            styles.predictBtn,
            {
              backgroundColor: activeCount === 0 ? c.border : Colors.brand.primary,
              opacity: pressed || loading ? 0.85 : 1,
            },
          ]}
          testID="predict-impact-btn"
        >
          {loading ? (
            <>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.predictBtnText}>Simulating…</Text>
            </>
          ) : (
            <>
              <Ionicons name="pulse" size={18} color="#fff" />
              <Text style={styles.predictBtnText}>
                {isPremium ? "Explore Meal Impact" : "Unlock Meal Explorer"}
              </Text>
              {!isPremium && <Ionicons name="lock-closed" size={14} color="rgba(255,255,255,0.7)" />}
            </>
          )}
        </Pressable>

        {error && (
          <View style={[styles.errorCard, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
            <Ionicons name="warning-outline" size={16} color="#991b1b" />
            <Text style={[styles.errorText, { color: "#991b1b" }]}>{error}</Text>
          </View>
        )}

        {result && impact && (
          <View style={styles.resultSection}>
            <View style={[styles.resultCard, { backgroundColor: impact.bg, borderColor: impact.border }]}>
              <Text style={[styles.riseNumber, { color: impact.text }]}>{impact.label}</Text>
              <Text style={[styles.riseLabel, { color: impact.text }]}>qualitative carbohydrate impact</Text>
              <View style={[styles.impactBadge, { backgroundColor: impact.text + "20" }]}>
                <Text style={[styles.impactBadgeText, { color: impact.text }]}>{impact.label}</Text>
              </View>
              <View style={styles.confidenceRow}>
                <Ionicons name="information-circle-outline" size={13} color={impact.text + "99"} />
                <Text style={[styles.confidenceText, { color: impact.text + "99" }]}>
                  {CONFIDENCE_LABEL[result.confidence]}
                </Text>
              </View>
            </View>

            <View style={[styles.reasoningCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.reasoningLabel, { color: c.textMuted }]}>WHY THIS MAY MATTER</Text>
              <Text style={[styles.reasoningText, { color: c.textPrimary }]}>{result.reasoning}</Text>
            </View>
            <View style={[styles.infoCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.reasoningLabel, { color: c.textMuted }]}>INFORMATION USED</Text>
              {result.informationUsed.map((detail) => <Text key={detail} style={[styles.infoText, { color: c.textSecondary }]}>• {detail}</Text>)}
              <Text style={[styles.infoText, { color: c.textMuted, marginTop: 8 }]}>{result.limitations}</Text>
              <Text style={[styles.infoText, { color: c.textMuted, marginTop: 6 }]}>{result.verification}</Text>
            </View>

            {result.betterOption && (
              <View style={[styles.betterCard, { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" }]}>
                <View style={styles.betterHeader}>
                  <Ionicons name="leaf" size={14} color={Colors.brand.primary} />
                  <Text style={[styles.betterLabel, { color: Colors.brand.primary }]}>BETTER OPTION</Text>
                </View>
                <Text style={[styles.betterText, { color: "#14532d" }]}>{result.betterOption}</Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12 },
  iconWrap: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "#dcfce7",
    alignItems: "center", justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  mealPill: {
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
  },
  mealPillName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  mealPillRestaurant: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  scroll: { paddingHorizontal: 16 },
  sectionLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8, marginBottom: 4 },
  sectionHint: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    borderWidth: 1, borderRadius: 20,
    paddingHorizontal: 11, paddingVertical: 6,
  },
  chipLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  summaryRow: {
    flexDirection: "row", alignItems: "center", gap: 6,
    borderTopWidth: 1, marginTop: 20, paddingTop: 14, marginBottom: 16,
  },
  summaryText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  predictBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center",
    gap: 8, borderRadius: 14,
    paddingVertical: 15, paddingHorizontal: 20,
    marginBottom: 16,
  },
  predictBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  errorCard: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, borderWidth: 1,
    paddingHorizontal: 14, paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  resultSection: { gap: 12 },
  resultCard: {
    borderRadius: 16, borderWidth: 1,
    padding: 20, alignItems: "center", gap: 6,
  },
  riseNumber: { fontFamily: "Inter_700Bold", fontSize: 26, textAlign: "center" },
  riseLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  impactBadge: {
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 20, marginTop: 4,
  },
  impactBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8 },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  confidenceText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  reasoningCard: {
    borderRadius: 14, borderWidth: 1,
    padding: 14,
  },
  reasoningLabel: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8, marginBottom: 6 },
  reasoningText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  infoCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  infoText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  betterCard: {
    borderRadius: 14, borderWidth: 1,
    padding: 14,
  },
  betterHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  betterLabel: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 },
  betterText: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
});
