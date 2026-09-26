import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import * as ImagePicker from "expo-image-picker";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useAiConsent } from "@/context/AiConsentContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { trackAnalyticsEvent } from "@/lib/analytics";
import { apiRequest } from "@/lib/query-client";
import {
  mealPhotoAnalysisSchema,
  mealPhotoResponseSchema,
  scaledNutrition,
  withUpdatedPortion,
  withConfirmedItem,
  type MealPhotoAnalysis,
  type MealPhotoItem,
} from "@/shared/meal-photo";

type Phase = "initial" | "loading" | "results" | "error";
type PortionUnit = "g" | "oz";
const OZ_GRAMS = 28.3495;

const IMPACT_TONE = {
  low: { bg: "#DCFCE7", color: "#166534", label: "LOW" },
  moderate: { bg: "#FEF3C7", color: "#92400E", label: "MODERATE" },
  high: { bg: "#FEE2E2", color: "#991B1B", label: "HIGH" },
  "insufficient-evidence": { bg: "#E5E7EB", color: "#374151", label: "NEEDS REVIEW" },
} as const;

const nutrientLabels: [keyof MealPhotoAnalysis["totals"], string, string][] = [
  ["carbohydratesGrams", "Carbs", "g"],
  ["netCarbohydratesGrams", "Net carbs", "g"],
  ["sugarsGrams", "Sugars", "g"],
  ["fiberGrams", "Fiber", "g"],
  ["proteinGrams", "Protein", "g"],
  ["fatGrams", "Fat", "g"],
  ["energyKcal", "Calories", ""],
];

export default function PlateAnalysisScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const { savedId } = useLocalSearchParams<{ savedId?: string }>();
  const { canScan, showPaywall, incrementScan } = useSubscription();
  const { requestConsent } = useAiConsent();
  const [phase, setPhase] = useState<Phase>("initial");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<MealPhotoAnalysis | null>(null);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(Boolean(savedId));
  const [saveToken, setSaveToken] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [units, setUnits] = useState<Record<string, PortionUnit>>({});
  const topPad = Platform.OS === "web" ? 66 : insets.top + 8;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 92;

  useEffect(() => {
    if (!savedId) return;
    let active = true;
    setPhase("loading");
    apiRequest("GET", "/api/meal-photo/saved")
      .then((response) => response.json())
      .then((rows: unknown) => {
        if (!active || !Array.isArray(rows)) return;
        const row = rows.find((entry) => String((entry as { id?: unknown }).id) === String(savedId)) as { analysis?: unknown } | undefined;
        const parsed = mealPhotoAnalysisSchema.safeParse(row?.analysis);
        if (!parsed.success) throw new Error("This saved meal analysis is no longer available.");
        setAnalysis(parsed.data);
        setPhase("results");
      })
      .catch((reason: unknown) => {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "Could not open the saved meal.");
        setPhase("error");
      });
    return () => { active = false; };
  }, [savedId]);

  const analyze = useCallback(async (asset: ImagePicker.ImagePickerAsset) => {
    if (!canScan) return showPaywall("scan-limit");
    const agreed = await requestConsent();
    if (!agreed) return;
    if (!asset.base64) {
      setError("This photo could not be prepared. Choose another image.");
      setPhase("error");
      return;
    }
    setPreviewUri(asset.uri);
    setPhase("loading");
    setError("");
    trackAnalyticsEvent("plate_scan_started", {
      source: Platform.OS === "web" ? "picker" : "camera_or_picker",
    });
    try {
      const imageType = ["image/jpeg", "image/png", "image/webp"].includes(asset.mimeType ?? "") ? asset.mimeType : "image/jpeg";
      const response = await apiRequest("POST", "/api/meal-photo", { image: asset.base64, imageType });
      const json: unknown = await response.json();
      const parsed = mealPhotoResponseSchema.safeParse(json);
      if (!parsed.success) {
        const message = typeof json === "object" && json && "error" in json ? String(json.error) : "The meal result was incomplete. Try a clearer photo.";
        throw new Error(message);
      }
      incrementScan();
      setAnalysis(parsed.data);
      setSaveToken(parsed.data.saveToken);
      setSaved(false);
      setUnits({});
      setPhase("results");
      trackAnalyticsEvent("plate_scan_completed", {
        impact_level: parsed.data.impact.level,
        nutrition_status: parsed.data.nutritionStatus,
        item_count: parsed.data.items.length,
        has_unknown_items: parsed.data.unknownItems.length > 0,
      });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not analyze this meal photo.");
      setPhase("error");
      trackAnalyticsEvent("plate_scan_failed");
    }
  }, [canScan, incrementScan, requestConsent, showPaywall]);

  const choosePhoto = useCallback(async () => {
    if (!canScan) return showPaywall("scan-limit");
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) void analyze(result.assets[0]);
  }, [analyze, canScan, showPaywall]);

  const takePhoto = useCallback(async () => {
    if (!canScan) return showPaywall("scan-limit");
    if (Platform.OS === "web") return void choosePhoto();
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (permission.status !== "granted") {
      Alert.alert("Camera access needed", "Allow camera access in settings, or choose a meal photo instead.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.8,
      base64: true,
      exif: false,
    });
    if (!result.canceled && result.assets[0]) void analyze(result.assets[0]);
  }, [analyze, canScan, choosePhoto, showPaywall]);

  const updatePortion = useCallback((item: MealPhotoItem, text: string) => {
    if (!analysis) return;
    const value = Number(text);
    if (!Number.isFinite(value) || value <= 0) return;
    const grams = units[item.id] === "oz" ? value * OZ_GRAMS : value;
    if (grams > 3_000) return;
    setAnalysis(withUpdatedPortion(analysis, item.id, grams));
    setSaved(false);
    trackAnalyticsEvent("plate_portion_updated", {
      unit: units[item.id] === "oz" ? "oz" : "g",
    });
  }, [analysis, units]);

  const toggleUnit = useCallback((item: MealPhotoItem) => {
    setUnits((current) => ({ ...current, [item.id]: current[item.id] === "oz" ? "g" : "oz" }));
  }, []);

  const saveMeal = useCallback(async () => {
    if (!analysis || !saveToken || saved) return;
    setSaving(true);
    try {
      await apiRequest("POST", "/api/meal-photo/saved", {
        saveToken,
        portions: analysis.items.map(({ id, portionGrams, confirmed }) => ({ id, portionGrams, confirmed })),
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      trackAnalyticsEvent("plate_analysis_saved", {
        nutrition_status: analysis.nutritionStatus,
        item_count: analysis.items.length,
      });
    } catch {
      Alert.alert("Couldn’t save meal", "Please try again.");
    } finally {
      setSaving(false);
    }
  }, [analysis, saveToken, saved]);

  const reset = useCallback(() => {
    setPreviewUri(null);
    setAnalysis(null);
    setError("");
    setSaved(false);
    setSaveToken(null);
    setUnits({});
    setPhase("initial");
  }, []);

  const topCarbItem = useMemo(() => {
    if (!analysis) return null;
    return analysis.items
      .map((item) => ({ item, carbs: scaledNutrition(item).carbohydratesGrams ?? -1 }))
      .filter(({ carbs }) => carbs > 0)
      .sort((a, b) => b.carbs - a.carbs)[0] ?? null;
  }, [analysis]);

  if (phase === "loading") {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        {previewUri ? <Image source={{ uri: previewUri }} style={styles.loadingImage} blurRadius={3} /> : null}
        <View style={[styles.loadingCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={[styles.stateTitle, { color: c.textPrimary }]}>Analyzing visible foods…</Text>
          <Text style={[styles.stateCopy, { color: c.textSecondary }]}>Estimating portions, then checking available USDA nutrition.</Text>
        </View>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={[styles.centered, { backgroundColor: c.background, paddingTop: topPad }]}>
        <Ionicons name="image-outline" size={58} color={Colors.brand.cautionText} />
        <Text style={[styles.stateTitle, { color: c.textPrimary }]}>Meal photo needs another look</Text>
        <Text style={[styles.stateCopy, { color: c.textSecondary }]}>{error}</Text>
        <Pressable style={styles.primaryButton} onPress={takePhoto} accessibilityRole="button">
          <Text style={styles.primaryButtonText}>Try another photo</Text>
        </Pressable>
        <Pressable onPress={reset} accessibilityRole="button"><Text style={styles.linkText}>Back to plate analysis</Text></Pressable>
      </View>
    );
  }

  if (phase === "results" && analysis) {
    const tone = IMPACT_TONE[analysis.impact.level];
    const halfCarbs = topCarbItem ? Math.round(topCarbItem.carbs / 2 * 10) / 10 : null;
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <ScrollView contentContainerStyle={[styles.resultContent, { paddingTop: topPad, paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          <View style={styles.resultHeading}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.eyebrow, { color: c.textSecondary }]}>FOOD-ONLY ESTIMATE</Text>
              <Text style={[styles.title, { color: c.textPrimary }]}>{analysis.mealName}</Text>
            </View>
            <Pressable onPress={reset} style={styles.iconButton} accessibilityLabel="Analyze another meal">
              <Ionicons name="camera-outline" size={20} color={Colors.brand.primary} />
            </Pressable>
          </View>
          {previewUri ? <Image source={{ uri: previewUri }} style={styles.resultImage} accessibilityLabel="Meal photo being analyzed" /> : null}

          <View style={[styles.impactCard, { backgroundColor: tone.bg }]}>
            <Text style={[styles.impactLabel, { color: tone.color }]}>{tone.label} ESTIMATED IMPACT</Text>
            <Text style={[styles.impactExplanation, { color: tone.color }]}>{analysis.impact.explanation}</Text>
          </View>

          <View style={[styles.disclaimerCard, { borderColor: c.border, backgroundColor: c.cardBg }]}>
            <Ionicons name="information-circle-outline" size={18} color={Colors.brand.cautionText} />
            <Text style={[styles.disclaimerText, { color: c.textSecondary }]}>{analysis.disclaimer}</Text>
          </View>

          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Estimated nutrition</Text>
          <View style={styles.nutrientGrid}>
            {nutrientLabels.map(([key, label, suffix]) => (
              <View key={key} style={[styles.nutrientCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Text style={[styles.nutrientValue, { color: c.textPrimary }]}>
                  {analysis.totals[key] === null ? "—" : `${analysis.totals[key]}${suffix}`}
                </Text>
                <Text style={[styles.nutrientLabel, { color: c.textSecondary }]}>{label}</Text>
              </View>
            ))}
          </View>
          {analysis.nutritionStatus !== "complete" ? (
            <Text style={[styles.partialNote, { color: Colors.brand.cautionText }]}>Totals are {analysis.nutritionStatus}; foods without provider-backed values are not counted.</Text>
          ) : null}

          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Foods and portions</Text>
          {analysis.items.map((item) => {
            const unit = units[item.id] ?? "g";
            const shown = unit === "oz" ? item.portionGrams / OZ_GRAMS : item.portionGrams;
            return (
              <View key={item.id} style={[styles.foodCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <View style={styles.foodHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.foodName, { color: c.textPrimary }]}>{item.name}</Text>
                    <Text style={[styles.foodMeta, { color: c.textSecondary }]}>{item.confidence} confidence · {item.portionLabel}</Text>
                  </View>
                  <View style={styles.portionEditor}>
                    <TextInput
                      value={String(Math.round(shown * 10) / 10)}
                      onChangeText={(value) => updatePortion(item, value)}
                      keyboardType="decimal-pad"
                      style={[styles.portionInput, { color: c.textPrimary, borderColor: c.border }]}
                      accessibilityLabel={`${item.name} portion quantity`}
                    />
                    <Pressable onPress={() => toggleUnit(item)} style={[styles.unitButton, { borderColor: c.border }]} accessibilityLabel={`Change ${item.name} portion unit`}>
                      <Text style={{ color: Colors.brand.primary, fontFamily: "Inter_600SemiBold" }}>{unit}</Text>
                    </Pressable>
                  </View>
                </View>
                <Text style={[styles.evidence, { color: c.textSecondary }]}>{item.visibleEvidence}</Text>
                <Text style={[styles.source, { color: item.nutrition ? Colors.brand.goodText : Colors.brand.cautionText }]}>
                  {item.matchedFoodName ? `Possible USDA match: ${item.matchedFoodName}. ${item.resolutionNote}` : item.resolutionNote}
                </Text>
                {item.nutrition && !item.confirmed ? (
                  <Pressable
                    onPress={() => {
                      setAnalysis(withConfirmedItem(analysis, item.id));
                      setSaved(false);
                      trackAnalyticsEvent("provider_match_confirmed", {
                        confidence: item.confidence,
                      });
                    }}
                    style={styles.confirmButton}
                    accessibilityRole="button"
                    accessibilityLabel={`Confirm ${item.matchedFoodName} matches ${item.name}`}
                  >
                    <Ionicons name="checkmark-circle-outline" size={16} color={Colors.brand.primary} />
                    <Text style={styles.confirmButtonText}>Confirm this food match</Text>
                  </Pressable>
                ) : item.confirmed ? (
                  <Text style={styles.confirmedText}>Food match confirmed by you</Text>
                ) : null}
              </View>
            );
          })}
          {analysis.unknownItems.length ? (
            <View style={[styles.unknownCard, { borderColor: Colors.brand.caution, backgroundColor: Colors.brand.cautionLight }]}>
              <Text style={[styles.foodName, { color: Colors.brand.cautionText }]}>Needs your confirmation</Text>
              {analysis.unknownItems.map((item, index) => <Text key={index} style={[styles.evidence, { color: Colors.brand.cautionText }]}>• {item}</Text>)}
            </View>
          ) : null}

          <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Main drivers</Text>
          {analysis.impact.drivers.map((driver, index) => (
            <View key={index} style={styles.driverRow}>
              <Ionicons name="ellipse" size={7} color={Colors.brand.primary} />
              <Text style={[styles.driverText, { color: c.textSecondary }]}>{driver}</Text>
            </View>
          ))}

          {topCarbItem && halfCarbs !== null ? (
            <>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Smart portion swap</Text>
              <View style={[styles.swapCard, { backgroundColor: Colors.brand.goodLight }]}>
                <Ionicons name="swap-horizontal-outline" size={23} color={Colors.brand.goodText} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.foodName, { color: Colors.brand.goodText }]}>Try half the {topCarbItem.item.name} portion</Text>
                  <Text style={[styles.evidence, { color: Colors.brand.goodText }]}>
                    Provider-based comparison: about {topCarbItem.carbs}g → {halfCarbs}g carbohydrate from this food. Add non-starchy vegetables if desired; their nutrition is not included here.
                  </Text>
                  <Pressable
                    onPress={() => {
                      setAnalysis(withUpdatedPortion(analysis, topCarbItem.item.id, topCarbItem.item.portionGrams / 2));
                      setSaved(false);
                      trackAnalyticsEvent("smart_portion_swap_applied", {
                        nutrition_status: analysis.nutritionStatus,
                      });
                    }}
                    accessibilityRole="button"
                  >
                    <Text style={[styles.swapAction, { color: Colors.brand.goodText }]}>Apply half portion and recalculate</Text>
                  </Pressable>
                </View>
              </View>
            </>
          ) : null}

          <Pressable onPress={saveMeal} disabled={saved || saving || !saveToken} style={[styles.primaryButton, (saved || saving || !saveToken) && { opacity: 0.6 }]} accessibilityRole="button" accessibilityLabel="Save this meal analysis">
            <Ionicons name={saved ? "checkmark-circle" : "bookmark-outline"} size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>{saving ? "Saving…" : saved ? "Meal saved" : "Save Meal"}</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={[styles.initialContent, { paddingTop: topPad, paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.heroIcon, { backgroundColor: Colors.brand.goodLight }]}>
          <Ionicons name="camera-outline" size={48} color={Colors.brand.primary} />
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>Analyze My Plate</Text>
        <Text style={[styles.intro, { color: c.textSecondary }]}>Photograph a plated meal to identify visible foods, estimate portions, and review a food-only glucose-impact estimate.</Text>
        <View style={[styles.disclaimerCard, { borderColor: c.border, backgroundColor: c.cardBg }]}>
          <Ionicons name="shield-checkmark-outline" size={19} color={Colors.brand.primary} />
          <Text style={[styles.disclaimerText, { color: c.textSecondary }]}>No glucose number or medication advice. Photos are analyzed transiently and are not saved.</Text>
        </View>
        <Pressable onPress={takePhoto} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel={Platform.OS === "web" ? "Choose a meal photo" : "Take a meal photo"}>
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryButtonText}>{Platform.OS === "web" ? "Choose a Meal Photo" : "Take a Photo"}</Text>
        </Pressable>
        {Platform.OS !== "web" ? (
          <Pressable onPress={choosePhoto} style={styles.secondaryButton} accessibilityRole="button" accessibilityLabel="Choose a meal photo from the system picker">
            <Ionicons name="images-outline" size={19} color={Colors.brand.primary} />
            <Text style={styles.secondaryButtonText}>Choose from Photos</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  initialContent: { paddingHorizontal: 22, alignItems: "center" },
  heroIcon: { width: 108, height: 108, borderRadius: 30, alignItems: "center", justifyContent: "center", marginTop: 24, marginBottom: 22 },
  title: { fontFamily: "Inter_700Bold", fontSize: 27, lineHeight: 34 },
  intro: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22, textAlign: "center", marginTop: 10, marginBottom: 22 },
  primaryButton: { width: "100%", minHeight: 52, backgroundColor: Colors.brand.primary, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 18, paddingHorizontal: 18 },
  primaryButtonText: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 16 },
  secondaryButton: { width: "100%", minHeight: 50, borderWidth: 1.5, borderColor: Colors.brand.primary, borderRadius: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
  secondaryButtonText: { color: Colors.brand.primary, fontFamily: "Inter_600SemiBold", fontSize: 15 },
  disclaimerCard: { width: "100%", borderRadius: 13, borderWidth: 1, padding: 13, flexDirection: "row", gap: 9, alignItems: "flex-start" },
  disclaimerText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  loadingImage: { ...StyleSheet.absoluteFill, opacity: 0.3 },
  loadingCard: { width: "88%", maxWidth: 360, padding: 28, borderWidth: 1, borderRadius: 20, alignItems: "center", gap: 12 },
  stateTitle: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  stateCopy: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, textAlign: "center" },
  linkText: { color: Colors.brand.primary, fontFamily: "Inter_600SemiBold", marginTop: 18 },
  resultContent: { paddingHorizontal: 17, gap: 12 },
  resultHeading: { flexDirection: "row", alignItems: "center", gap: 12 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 1 },
  iconButton: { width: 42, height: 42, borderRadius: 21, backgroundColor: Colors.brand.goodLight, alignItems: "center", justifyContent: "center" },
  resultImage: { width: "100%", height: 210, borderRadius: 18, resizeMode: "cover" },
  impactCard: { borderRadius: 16, padding: 16, gap: 7 },
  impactLabel: { fontFamily: "Inter_700Bold", fontSize: 13, letterSpacing: 0.6 },
  impactExplanation: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 9 },
  nutrientGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nutrientCard: { width: "31%", minWidth: 96, flexGrow: 1, borderWidth: 1, borderRadius: 12, padding: 11 },
  nutrientValue: { fontFamily: "Inter_700Bold", fontSize: 17 },
  nutrientLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  partialNote: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  foodCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 8 },
  foodHeader: { flexDirection: "row", gap: 10, alignItems: "center" },
  foodName: { fontFamily: "Inter_700Bold", fontSize: 14, lineHeight: 19 },
  foodMeta: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3, textTransform: "capitalize" },
  portionEditor: { flexDirection: "row" },
  portionInput: { width: 64, height: 40, borderWidth: 1, borderTopLeftRadius: 9, borderBottomLeftRadius: 9, paddingHorizontal: 8, textAlign: "right", fontFamily: "Inter_500Medium" },
  unitButton: { height: 40, minWidth: 43, borderWidth: 1, borderLeftWidth: 0, borderTopRightRadius: 9, borderBottomRightRadius: 9, alignItems: "center", justifyContent: "center" },
  evidence: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  source: { fontFamily: "Inter_500Medium", fontSize: 11, lineHeight: 16 },
  confirmButton: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingVertical: 5 },
  confirmButtonText: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 12 },
  confirmedText: { color: Colors.brand.goodText, fontFamily: "Inter_600SemiBold", fontSize: 11 },
  unknownCard: { borderWidth: 1, borderRadius: 14, padding: 13, gap: 5 },
  driverRow: { flexDirection: "row", gap: 9, alignItems: "center", paddingHorizontal: 4 },
  driverText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  swapCard: { borderRadius: 14, padding: 14, flexDirection: "row", gap: 11, alignItems: "flex-start" },
  swapAction: { fontFamily: "Inter_700Bold", fontSize: 12, marginTop: 8, textDecorationLine: "underline" },
});