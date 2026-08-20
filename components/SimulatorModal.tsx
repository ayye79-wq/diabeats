import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import {
  View,
  Text,
  Modal,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/context/SubscriptionContext";
import { simulationResultSchema } from "@/shared/ai-safety";

interface Component {
  id: string;
  label: string;
  active: boolean;
}

type SimulationResult = ReturnType<typeof simulationResultSchema.parse>;

const IMPACT_CONFIG = {
  low: { label: "LOW IMPACT", bg: "#dcfce7", text: "#15803d", border: "#bbf7d0" },
  moderate: { label: "MODERATE IMPACT", bg: "#fef9c3", text: "#854d0e", border: "#fde047" },
  high: { label: "HIGH IMPACT", bg: "#fee2e2", text: "#991b1b", border: "#fca5a5" },
};

const CONFIDENCE_LABEL = {
  low: "Low confidence",
  medium: "Medium confidence",
  high: "High confidence",
};

const CUISINE_ADDONS: Record<string, { id: string; label: string }[]> = {
  "American Grill": [
    { id: "ao-1", label: "Mashed potatoes" },
    { id: "ao-2", label: "Steak fries" },
    { id: "ao-3", label: "Garlic butter" },
    { id: "ao-4", label: "Grilled asparagus" },
    { id: "ao-5", label: "Creamed spinach" },
    { id: "ao-6", label: "Steak sauce" },
    { id: "ao-7", label: "Side salad" },
    { id: "ao-8", label: "Bread roll" },
  ],
  "Health-Conscious American": [
    { id: "ao-1", label: "Avocado" },
    { id: "ao-2", label: "Side salad" },
    { id: "ao-3", label: "Quinoa" },
    { id: "ao-4", label: "Brown rice" },
    { id: "ao-5", label: "Sweet potato" },
    { id: "ao-6", label: "Extra greens" },
    { id: "ao-7", label: "Olive oil dressing" },
    { id: "ao-8", label: "Hard-boiled egg" },
  ],
  Mexican: [
    { id: "ao-1", label: "White rice" },
    { id: "ao-2", label: "Brown rice" },
    { id: "ao-3", label: "Flour tortilla" },
    { id: "ao-4", label: "Black beans" },
    { id: "ao-5", label: "Pinto beans" },
    { id: "ao-6", label: "Guacamole" },
    { id: "ao-7", label: "Sour cream" },
    { id: "ao-8", label: "Chips & salsa" },
  ],
  "Mexican Fast Casual": [
    { id: "ao-1", label: "White rice" },
    { id: "ao-2", label: "Brown rice" },
    { id: "ao-3", label: "Flour tortilla" },
    { id: "ao-4", label: "Black beans" },
    { id: "ao-5", label: "Pinto beans" },
    { id: "ao-6", label: "Guacamole" },
    { id: "ao-7", label: "Sour cream" },
    { id: "ao-8", label: "Chips" },
  ],
  Japanese: [
    { id: "ao-1", label: "White rice" },
    { id: "ao-2", label: "Brown rice" },
    { id: "ao-3", label: "Miso soup" },
    { id: "ao-4", label: "Edamame" },
    { id: "ao-5", label: "Gyoza (2 pcs)" },
    { id: "ao-6", label: "Noodles" },
    { id: "ao-7", label: "Soy sauce (light)" },
    { id: "ao-8", label: "Tempura" },
  ],
  Indian: [
    { id: "ao-1", label: "Basmati rice" },
    { id: "ao-2", label: "Naan bread" },
    { id: "ao-3", label: "Roti" },
    { id: "ao-4", label: "Raita" },
    { id: "ao-5", label: "Mango chutney" },
    { id: "ao-6", label: "Papadum" },
    { id: "ao-7", label: "Lentil dal" },
    { id: "ao-8", label: "Samosa" },
  ],
  Mediterranean: [
    { id: "ao-1", label: "Pita bread" },
    { id: "ao-2", label: "Hummus" },
    { id: "ao-3", label: "Tzatziki" },
    { id: "ao-4", label: "Tabbouleh" },
    { id: "ao-5", label: "Feta cheese" },
    { id: "ao-6", label: "Olives" },
    { id: "ao-7", label: "Rice pilaf" },
    { id: "ao-8", label: "Side salad" },
  ],
  "Salad / Healthy": [
    { id: "ao-1", label: "Croutons" },
    { id: "ao-2", label: "Extra dressing" },
    { id: "ao-3", label: "Grilled chicken" },
    { id: "ao-4", label: "Avocado" },
    { id: "ao-5", label: "Hard-boiled egg" },
    { id: "ao-6", label: "Nuts & seeds" },
    { id: "ao-7", label: "Cheese" },
    { id: "ao-8", label: "Crispy chickpeas" },
  ],
  "Cafe / Bakery": [
    { id: "ao-1", label: "Pastry" },
    { id: "ao-2", label: "Butter & jam" },
    { id: "ao-3", label: "Coffee with milk" },
    { id: "ao-4", label: "Orange juice" },
    { id: "ao-5", label: "Granola" },
    { id: "ao-6", label: "Honey" },
    { id: "ao-7", label: "Yogurt" },
    { id: "ao-8", label: "Fruit cup" },
  ],
};

const DEFAULT_ADDONS = [
  { id: "ao-1", label: "Side salad" },
  { id: "ao-2", label: "Bread roll" },
  { id: "ao-3", label: "White rice" },
  { id: "ao-4", label: "Cheese" },
  { id: "ao-5", label: "Extra sauce" },
  { id: "ao-6", label: "Fries" },
  { id: "ao-7", label: "Avocado" },
  { id: "ao-8", label: "Dressing" },
];

function extractComponents(meal: {
  name: string;
  description: string;
  orderSteps?: { label: string; choice: string; skip?: boolean }[];
}): Component[] {
  if (meal.orderSteps && meal.orderSteps.length > 0) {
    return meal.orderSteps
      .filter((s) => !s.skip)
      .map((s, i) => ({ id: `step-${i}`, label: s.choice, active: true }));
  }
  // Split on commas, periods, " with ", " and ", " topped with ", " served with "
  let parts = meal.description
    .split(/[,.]|\s+with\s+|\s+and\s+|\s+topped\s+with\s+|\s+served\s+with\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 2 && s.length < 60)
    .slice(0, 8);
  // Always ensure at least the meal name is a component
  if (parts.length === 0) {
    parts = [meal.name];
  }
  return parts.map((p, i) => ({
    id: `part-${i}`,
    label: p.charAt(0).toUpperCase() + p.slice(1),
    active: true,
  }));
}

interface Props {
  visible: boolean;
  onClose: () => void;
  restaurantName: string;
  restaurantCuisine: string;
  mealName: string;
  mealDescription: string;
  mealNutrients: { label: string; value: string }[];
  mealCarbRange: string;
  orderSteps?: { label: string; choice: string; skip?: boolean }[];
}

export function SimulatorModal({
  visible,
  onClose,
  restaurantName,
  restaurantCuisine,
  mealName,
  mealDescription,
  mealNutrients,
  mealCarbRange,
  orderSteps,
}: Props) {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const { isPremium, showPaywall } = useSubscription();

  const baseComponents = useMemo(
    () =>
      extractComponents({
        name: mealName,
        description: mealDescription,
        orderSteps,
      }),
    [mealName, mealDescription, orderSteps]
  );

  const addOnList = useMemo(
    () => CUISINE_ADDONS[restaurantCuisine] ?? DEFAULT_ADDONS,
    [restaurantCuisine]
  );

  const scrollRef = useRef<any>(null);
  const [components, setComponents] = useState<Component[]>(baseComponents);
  const [addOns, setAddOns] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-sync components every time the modal opens — recompute fresh to avoid stale state
  useEffect(() => {
    if (visible) {
      const fresh = extractComponents({ name: mealName, description: mealDescription, orderSteps });
      setComponents(fresh);
      setAddOns(new Set());
      setResult(null);
      setError(null);
      setLoading(false);
    }
  }, [visible, mealName, mealDescription, orderSteps]);

  // Scroll to show result or error when they appear
  useEffect(() => {
    if (result || error) {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [result, error]);

  const reset = useCallback(() => {
    setComponents(baseComponents);
    setAddOns(new Set());
    setResult(null);
    setError(null);
    setLoading(false);
  }, [baseComponents]);

  const handleClose = () => {
    onClose();
    setTimeout(reset, 400);
  };

  const toggleComponent = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setComponents((prev) =>
      prev.map((comp) => (comp.id === id ? { ...comp, active: !comp.active } : comp))
    );
    setResult(null);
  }, []);

  const toggleAddOn = useCallback((id: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddOns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setResult(null);
  }, []);

  const runSimulation = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const selected = components.filter((comp) => comp.active).map((comp) => comp.label);
      const removed = components.filter((comp) => !comp.active).map((comp) => comp.label);
      const extras = addOnList.filter((a) => addOns.has(a.id)).map((a) => a.label);
      const res = await apiRequest("POST", "/api/simulate-impact", {
        restaurantName,
        mealName,
        nutrients: mealNutrients,
        carbRange: mealCarbRange,
        selectedComponents: [...selected, ...extras],
        removedComponents: removed,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const validated = simulationResultSchema.safeParse(data);
      if (!validated.success) throw new Error("The meal comparison was incomplete.");
      setResult(validated.data);
      if (!isPremium && !__DEV__) {
        showPaywall("meal-simulator");
      }
    } catch {
      setError("Simulation failed. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [
    isPremium,
    showPaywall,
    components,
    addOns,
    addOnList,
    restaurantName,
    mealName,
    mealNutrients,
    mealCarbRange,
  ]);

  const activeCount = components.filter((comp) => comp.active).length + addOns.size;
  const impact = result
    ? IMPACT_CONFIG[result.impactLevel] ?? IMPACT_CONFIG["moderate"]
    : null;

  const sheetBg = isDark ? "#111f15" : "#ffffff";
  const borderColor = isDark ? "#2d4a35" : "#e2f0e6";
  const primary = Colors.brand.primary;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View
          style={[
            styles.sheet,
            { backgroundColor: sheetBg, paddingBottom: insets.bottom + 8 },
          ]}
        >
          <View style={styles.handle} />

          <View style={styles.sheetHeader}>
            <View style={[styles.iconWrap, { backgroundColor: "#dcfce7" }]}>
              <Ionicons name="pulse" size={18} color={primary} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.sheetTitle, { color: c.textPrimary }]}>
                 Meal Impact Explorer
              </Text>
              <Text style={[styles.sheetSub, { color: c.textMuted }]}>
                 Compare food patterns—not a glucose prediction
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12} testID="close-simulator">
              <Ionicons name="close" size={22} color={c.textMuted} />
            </Pressable>
          </View>

          <View style={[styles.mealPill, { backgroundColor: c.cardBg, borderColor }]}>
            <Text style={[styles.mealPillName, { color: c.textPrimary }]} numberOfLines={1}>
              {mealName}
            </Text>
            <Text style={[styles.mealPillSub, { color: c.textMuted }]}>
              {restaurantName} · {mealCarbRange}
            </Text>
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.scroll}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
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
                      ? { backgroundColor: primary + "18", borderColor: primary + "50" }
                      : { backgroundColor: c.cardBg, borderColor },
                  ]}
                  testID={`component-chip-${comp.id}`}
                >
                  <Ionicons
                    name={comp.active ? "checkmark-circle" : "close-circle"}
                    size={14}
                    color={comp.active ? primary : c.textMuted}
                  />
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: comp.active ? primary : c.textMuted },
                    ]}
                  >
                    {comp.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={[styles.sectionLabel, { color: c.textMuted, marginTop: 20 }]}>
              ADD TO MEAL
            </Text>
            <Text style={[styles.sectionHint, { color: c.textSecondary }]}>
              Tap to add extras to the simulation
            </Text>
            <View style={styles.chips}>
              {addOnList.map((ao) => {
                const isActive = addOns.has(ao.id);
                return (
                  <Pressable
                    key={ao.id}
                    onPress={() => toggleAddOn(ao.id)}
                    style={[
                      styles.chip,
                      isActive
                        ? { backgroundColor: "#fef9c3", borderColor: "#fde047" }
                        : { backgroundColor: c.cardBg, borderColor },
                    ]}
                    testID={`addon-chip-${ao.id}`}
                  >
                    <Ionicons
                      name={isActive ? "add-circle" : "add-circle-outline"}
                      size={14}
                      color={isActive ? "#854d0e" : c.textMuted}
                    />
                    <Text
                      style={[
                        styles.chipLabel,
                        { color: isActive ? "#854d0e" : c.textSecondary },
                      ]}
                    >
                      {ao.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={[styles.divider, { borderColor }]}>
              <Ionicons name="list-outline" size={14} color={c.textMuted} />
              <Text style={[styles.summaryText, { color: c.textMuted }]}>
                {activeCount} ingredient{activeCount !== 1 ? "s" : ""} selected
              </Text>
            </View>

            <Pressable
              onPress={runSimulation}
              disabled={loading || activeCount === 0}
              style={({ pressed }) => [
                styles.runBtn,
                {
                  backgroundColor: activeCount === 0 ? c.border : primary,
                  opacity: pressed || loading ? 0.85 : 1,
                },
              ]}
              testID="predict-impact-btn"
            >
              {loading ? (
                <>
                  <ActivityIndicator size="small" color="#fff" />
                  <Text style={styles.runBtnText}>Simulating…</Text>
                </>
              ) : (
                <>
                  <Ionicons name="pulse" size={18} color="#fff" />
                  <Text style={styles.runBtnText}>Run Simulation</Text>
                </>
              )}
            </Pressable>

            {!isPremium && (
              <View style={[styles.premiumBanner, { backgroundColor: primary + "12", borderColor: primary + "30" }]}>
                <Ionicons name="lock-closed-outline" size={14} color={primary} />
                <Text style={[styles.premiumBannerText, { color: primary }]}>
                  Premium feature — tap Run Simulation to unlock
                </Text>
              </View>
            )}

            {error && (
              <View style={styles.errorCard}>
                <Ionicons name="warning-outline" size={16} color="#991b1b" />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            {result && impact && (
              <View style={styles.resultSection}>
                <View
                  style={[
                    styles.resultCard,
                    { backgroundColor: impact.bg, borderColor: impact.border },
                  ]}
                >
                  <Text style={[styles.riseNumber, { color: impact.text }]}>
                    {impact.label}
                  </Text>
                  <Text style={[styles.riseLabel, { color: impact.text }]}>
                    qualitative carbohydrate impact
                  </Text>
                  <View
                    style={[
                      styles.impactBadge,
                      { backgroundColor: impact.text + "20" },
                    ]}
                  >
                    <Text style={[styles.impactBadgeText, { color: impact.text }]}>
                      {impact.label}
                    </Text>
                  </View>
                  <View style={styles.confidenceRow}>
                    <Ionicons
                      name="information-circle-outline"
                      size={13}
                      color={impact.text + "99"}
                    />
                    <Text
                      style={[styles.confidenceText, { color: impact.text + "99" }]}
                    >
                      {CONFIDENCE_LABEL[result.confidence]}
                    </Text>
                  </View>
                </View>

                <View
                  style={[
                    styles.reasoningCard,
                    { backgroundColor: c.cardBg, borderColor },
                  ]}
                >
                  <Text style={[styles.reasoningLabel, { color: c.textMuted }]}>
                    WHY THIS MAY MATTER
                  </Text>
                  <Text style={[styles.reasoningText, { color: c.textPrimary }]}>
                    {result.reasoning}
                  </Text>
                </View>
                <View style={[styles.reasoningCard, { backgroundColor: c.cardBg, borderColor }]}>
                  <Text style={[styles.reasoningLabel, { color: c.textMuted }]}>INFORMATION USED</Text>
                  {result.informationUsed.map((detail) => (
                    <Text key={detail} style={[styles.reasoningText, { color: c.textSecondary, fontSize: 12, lineHeight: 18 }]}>• {detail}</Text>
                  ))}
                  <Text style={[styles.reasoningText, { color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 8 }]}>{result.limitations}</Text>
                  <Text style={[styles.reasoningText, { color: c.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 }]}>{result.verification}</Text>
                </View>

                {result.betterOption && (
                  <View
                    style={[
                      styles.betterCard,
                      { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" },
                    ]}
                  >
                    <View style={styles.betterHeader}>
                      <Ionicons name="leaf" size={14} color={primary} />
                      <Text style={[styles.betterLabel, { color: primary }]}>
                        BETTER OPTION
                      </Text>
                    </View>
                    <Text style={[styles.betterText, { color: "#14532d" }]}>
                      {result.betterOption}
                    </Text>
                  </View>
                )}
              </View>
            )}
            {result && (
              <Text style={styles.simDisclaimer}>
                Educational comparison only · Not a glucose prediction or medical advice
              </Text>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "rgba(0,0,0,0.65)",
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: "88%",
    paddingTop: 12,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 20,
    marginBottom: 12,
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  sheetSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  mealPill: {
    marginHorizontal: 20,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  mealPillName: { fontFamily: "Inter_700Bold", fontSize: 14 },
  mealPillSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  scroll: { flex: 1 },
  scrollContent: { paddingHorizontal: 20, paddingBottom: 20 },
  sectionLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  sectionHint: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginBottom: 10,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 11,
    paddingVertical: 7,
  },
  chipLabel: { fontFamily: "Inter_500Medium", fontSize: 13 },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderTopWidth: 1,
    marginTop: 20,
    paddingTop: 14,
    marginBottom: 14,
  },
  summaryText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 14,
    paddingVertical: 15,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  runBtnText: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  premiumBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
  },
  premiumBannerText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    flex: 1,
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#fca5a5",
    backgroundColor: "#fee2e2",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 16,
  },
  errorText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: "#991b1b",
    flex: 1,
  },
  resultSection: { gap: 12 },
  resultCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    alignItems: "center",
    gap: 6,
  },
  riseNumber: { fontFamily: "Inter_700Bold", fontSize: 52 },
  riseLabel: { fontFamily: "Inter_400Regular", fontSize: 14 },
  impactBadge: {
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 4,
  },
  impactBadgeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  confidenceRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 4 },
  confidenceText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  reasoningCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  reasoningLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  reasoningText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 21,
  },
  betterCard: { borderRadius: 14, borderWidth: 1, padding: 14 },
  betterHeader: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  betterLabel: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.8 },
  betterText: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 20 },
  simDisclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, color: "#6b7280", textAlign: "center", paddingHorizontal: 20, paddingVertical: 16, lineHeight: 16 },
});
