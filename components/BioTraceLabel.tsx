import React, { useMemo, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Colors from "@/constants/colors";
import {
  bloodSugarFitSchema,
  labelExtractionSchema,
  LABEL_SCAN_DISCLAIMER,
  type BloodSugarFit,
  type LabelExtraction,
  type LabelNutrition,
} from "@/shared/biotrace-label";
import { IngredientAnalysisSection } from "@/components/IngredientAnalysisSection";
import type { IngredientAnalysis } from "@/shared/biotrace-ingredients";

type LabelReviewProps = {
  extraction: LabelExtraction;
  dark?: boolean;
  onConfirm: (extraction: LabelExtraction) => void;
  onRetake: () => void;
};

type LabelResultProps = {
  extraction: LabelExtraction;
  ingredientAnalysis: IngredientAnalysis;
  score: BloodSugarFit;
  dark?: boolean;
  onNewScan: () => void;
};

const numberFields: { key: keyof LabelNutrition; label: string; unit: string }[] = [
  { key: "calories", label: "Calories", unit: "kcal" },
  { key: "carbohydratesGrams", label: "Carbohydrates", unit: "g" },
  { key: "fiberGrams", label: "Fiber", unit: "g" },
  { key: "sugarsGrams", label: "Sugars", unit: "g" },
  { key: "addedSugarsGrams", label: "Added sugars", unit: "g" },
  { key: "proteinGrams", label: "Protein", unit: "g" },
  { key: "sodiumMilligrams", label: "Sodium", unit: "mg" },
];

function formatNumber(value: number | null, unit: string) {
  return value === null ? "Unavailable" : `${value}${unit}`;
}

function toInputValue(value: number | null) {
  return value === null ? "" : String(value);
}

function parseInputValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function BioTraceLabelReview({ extraction, dark = false, onConfirm, onRetake }: LabelReviewProps) {
  const [productName, setProductName] = useState(extraction.productName ?? "");
  const [brand, setBrand] = useState(extraction.brand ?? "");
  const [servingSize, setServingSize] = useState(extraction.servingSize ?? "");
  const [nutritionText, setNutritionText] = useState<Record<keyof LabelNutrition, string>>(() =>
    Object.fromEntries(numberFields.map(({ key }) => [key, toInputValue(extraction.nutrition[key])])) as Record<keyof LabelNutrition, string>,
  );
  const [validationError, setValidationError] = useState<string | null>(null);
  const c = dark ? Colors.dark : Colors.light;

  const confirm = () => {
    const nutrition = Object.fromEntries(
      numberFields.map(({ key }) => [key, parseInputValue(nutritionText[key])]),
    ) as LabelNutrition;
    const confirmed = labelExtractionSchema.safeParse({
      ...extraction,
      status: "ready",
      productName: productName.trim() || null,
      brand: brand.trim() || null,
      servingSize: servingSize.trim() || null,
      ingredientsText: extraction.ingredientsText,
      nutrition,
    });
    if (!confirmed.success) {
      setValidationError("Please use numbers of 0 or more for nutrition values, or leave values blank when unavailable.");
      return;
    }
    setValidationError(null);
    onConfirm(confirmed.data);
  };

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <View style={styles.eyebrowRow}>
          <Ionicons name="checkmark-circle-outline" size={18} color={Colors.brand.primary} />
          <Text style={[styles.eyebrow, { color: Colors.brand.primary }]}>Review before using</Text>
        </View>
        <Text style={[styles.title, { color: c.textPrimary }]}>Check what BioTrace read</Text>
        <Text style={[styles.copy, { color: c.textSecondary }]}>
          Confirm or correct the visible nutrition values. Ingredient text stays exactly as scanned so BioTrace never adds something the photo did not show.
        </Text>
      </View>

      {extraction.status === "incomplete" ? (
        <View style={styles.warning}>
          <Ionicons name="information-circle-outline" size={17} color="#92400E" />
          <Text style={styles.warningText}>This label was only partly legible. Review the available values carefully.</Text>
        </View>
      ) : null}

      <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Product identity</Text>
        <TextInput value={productName} onChangeText={setProductName} placeholder="Product name unavailable" placeholderTextColor={c.textMuted} style={[styles.textInput, { color: c.textPrimary, borderColor: c.border }]} accessibilityLabel="Confirmed product name" />
        <TextInput value={brand} onChangeText={setBrand} placeholder="Brand unavailable" placeholderTextColor={c.textMuted} style={[styles.textInput, { color: c.textPrimary, borderColor: c.border }]} accessibilityLabel="Confirmed brand" />
        <TextInput value={servingSize} onChangeText={setServingSize} placeholder="Serving size unavailable" placeholderTextColor={c.textMuted} style={[styles.textInput, { color: c.textPrimary, borderColor: c.border }]} accessibilityLabel="Confirmed serving size" />
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Nutrition per serving</Text>
        <View style={styles.nutritionGrid}>
          {numberFields.map(({ key, label, unit }) => (
            <View key={key} style={styles.inputField}>
              <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{label}</Text>
              <View style={[styles.numberInputWrap, { borderColor: c.border }]}>
                <TextInput
                  value={nutritionText[key]}
                  onChangeText={(value) => setNutritionText((current) => ({ ...current, [key]: value.replace(/[^0-9.]/g, "") }))}
                  placeholder="Unavailable"
                  placeholderTextColor={c.textMuted}
                  keyboardType="decimal-pad"
                  style={[styles.numberInput, { color: c.textPrimary }]}
                  accessibilityLabel={`Confirmed ${label}`}
                />
                <Text style={[styles.unit, { color: c.textMuted }]}>{unit}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Ingredients</Text>
        <TextInput
          value={extraction.ingredientsText ?? ""}
          placeholder="Ingredient list unavailable"
          placeholderTextColor={c.textMuted}
          multiline
          editable={false}
          style={[styles.ingredientsInput, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.background }]}
          accessibilityLabel="Scanned ingredient list"
        />
        <Text style={[styles.lockedIngredientsHint, { color: c.textSecondary }]}>
          If this transcription is wrong, use another photo instead of adding ingredients manually.
        </Text>
      </View>

      {validationError ? <Text style={styles.validationError} accessibilityLiveRegion="polite">{validationError}</Text> : null}
      <Pressable onPress={confirm} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Confirm label values">
        <Ionicons name="checkmark" size={19} color="#fff" />
        <Text style={styles.primaryButtonText}>Confirm label values</Text>
      </Pressable>
      <Pressable onPress={onRetake} style={[styles.secondaryButton, { borderColor: Colors.brand.primary }]} accessibilityRole="button" accessibilityLabel="Take or choose another label photo">
        <Ionicons name="camera-outline" size={18} color={Colors.brand.primary} />
        <Text style={[styles.secondaryButtonText, { color: Colors.brand.primary }]}>Use another photo</Text>
      </Pressable>
    </View>
  );
}

export function BioTraceLabelResult({ extraction, ingredientAnalysis, score, dark = false, onNewScan }: LabelResultProps) {
  const c = dark ? Colors.dark : Colors.light;
  const validatedScore = bloodSugarFitSchema.parse(score);
  const visibleNutrition = useMemo(
    () => numberFields.filter(({ key }) => extraction.nutrition[key] !== null),
    [extraction.nutrition],
  );

  return (
    <View style={styles.wrap}>
      <View style={[styles.resultHero, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[styles.eyebrow, { color: Colors.brand.primary }]}>BioTrace label summary</Text>
        <Text style={[styles.resultName, { color: c.textPrimary }]}>{extraction.productName ?? "Packaged food label"}</Text>
        <Text style={[styles.brand, { color: c.textSecondary }]}>{extraction.brand ?? "Brand unavailable"}</Text>
        <View style={styles.scoreRow}>
          <View style={styles.scoreCircle}>
            <Text style={styles.scoreNumber}>{validatedScore.score}</Text>
            <Text style={styles.scoreOutOf}>/100</Text>
          </View>
          <View style={styles.scoreCopy}>
            <Text style={[styles.scoreTitle, { color: c.textPrimary }]}>Educational meal-impact summary</Text>
            <Text style={[styles.scoreSubtitle, { color: c.textSecondary }]}>Based on confirmed label values—not an individual glucose prediction</Text>
          </View>
        </View>
        <Text style={[styles.resultExplanation, { color: c.textPrimary }]}>{validatedScore.explanation}</Text>
        {validatedScore.personalization !== "none" ? (
          <View style={styles.personalizedNote}>
            <Ionicons name="person-circle-outline" size={15} color={Colors.brand.primary} />
            <Text style={[styles.personalizedText, { color: c.textSecondary }]}>
              {validatedScore.personalization === "unavailable"
                ? "Your profile was considered, but the confirmed label values were too limited to personalize this summary."
                : "Personalized to your saved profile; confirmed label values stay unchanged."}
            </Text>
          </View>
        ) : null}
      </View>

      <View style={[styles.safetyCard, { backgroundColor: Colors.brand.cautionLight, borderColor: Colors.brand.caution }]}>
        <Ionicons name="information-circle-outline" size={17} color={Colors.brand.cautionText} />
        <View style={{ flex: 1 }}>
          <Text style={[styles.safetyTitle, { color: Colors.brand.cautionText }]}>Educational summary, not a diagnosis</Text>
          <Text style={[styles.safetyText, { color: Colors.brand.cautionText }]}>{LABEL_SCAN_DISCLAIMER}</Text>
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
        <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Nutrition snapshot</Text>
        <Text style={[styles.basis, { color: c.textSecondary }]}>
          Values shown {extraction.servingSize ? `per ${extraction.servingSize}` : "per serving (serving size unavailable)"}
        </Text>
        <View style={styles.resultNutritionGrid}>
          {numberFields.map(({ key, label, unit }) => (
            <View key={key} style={[styles.nutrient, { borderColor: c.border }]}>
              <Text style={[styles.fieldLabel, { color: c.textSecondary }]}>{label}</Text>
              <Text style={[styles.nutrientValue, { color: c.textPrimary }]}>{formatNumber(extraction.nutrition[key], unit)}</Text>
            </View>
          ))}
        </View>
        {visibleNutrition.length === 0 ? <Text style={[styles.emptyText, { color: c.textSecondary }]}>No nutrition values were legible enough to confirm.</Text> : null}
      </View>

      <IngredientAnalysisSection analysis={ingredientAnalysis} dark={dark} />

      <View style={styles.sourceRow}>
        <Ionicons name="shield-checkmark-outline" size={17} color={Colors.brand.primary} />
        <Text style={[styles.sourceText, { color: c.textSecondary }]}>Source: user-confirmed package photo. Not verified by Open Food Facts. The photo is not saved.</Text>
      </View>
      <Pressable onPress={onNewScan} style={styles.primaryButton} accessibilityRole="button" accessibilityLabel="Start a new BioTrace label scan">
        <Ionicons name="camera-outline" size={19} color="#fff" />
        <Text style={styles.primaryButtonText}>Scan another label</Text>
      </Pressable>
      <Text style={[styles.disclaimer, { color: c.textSecondary }]}>{LABEL_SCAN_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { borderWidth: 1, borderRadius: 18, padding: 18 },
  resultHero: { borderWidth: 1, borderRadius: 18, padding: 18 },
  eyebrowRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  eyebrow: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.7, textTransform: "uppercase" },
  title: { fontFamily: "Inter_700Bold", fontSize: 23, lineHeight: 29, marginTop: 8 },
  copy: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginTop: 7 },
  resultName: { fontFamily: "Inter_700Bold", fontSize: 25, lineHeight: 31, marginTop: 7 },
  brand: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 3 },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 13, marginTop: 18 },
  scoreCircle: { width: 76, height: 76, borderRadius: 38, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center" },
  scoreNumber: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 30 },
  scoreOutOf: { color: "#D8F3E1", fontFamily: "Inter_600SemiBold", fontSize: 11 },
  scoreCopy: { flex: 1 },
  scoreTitle: { fontFamily: "Inter_700Bold", fontSize: 17 },
  scoreSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 3 },
  resultExplanation: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19, marginTop: 15 },
  personalizedNote: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 9 },
  personalizedText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  warning: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12, backgroundColor: "#FEF3C7" },
  warningText: { flex: 1, color: "#92400E", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 10 },
  textInput: { minHeight: 44, borderWidth: 1, borderRadius: 10, paddingHorizontal: 11, fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 8 },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  inputField: { width: "47%" },
  fieldLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 4 },
  numberInputWrap: { minHeight: 42, borderWidth: 1, borderRadius: 10, flexDirection: "row", alignItems: "center", paddingLeft: 9, paddingRight: 8 },
  numberInput: { flex: 1, paddingVertical: 7, fontFamily: "Inter_500Medium", fontSize: 13 },
  unit: { fontFamily: "Inter_400Regular", fontSize: 11 },
  ingredientsInput: { minHeight: 90, borderWidth: 1, borderRadius: 10, padding: 10, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  lockedIngredientsHint: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 7 },
  validationError: { color: "#92400E", backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  primaryButton: { minHeight: 47, borderRadius: 12, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, paddingHorizontal: 16 },
  primaryButtonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  secondaryButton: { minHeight: 45, borderWidth: 1.5, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  secondaryButtonText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  safetyCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  safetyTitle: { fontFamily: "Inter_700Bold", fontSize: 12, marginBottom: 3 },
  safetyText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17 },
  basis: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: -5, marginBottom: 9 },
  resultNutritionGrid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  nutrient: { width: "50%", paddingHorizontal: 8, paddingVertical: 9, borderLeftWidth: 1 },
  nutrientValue: { fontFamily: "Inter_700Bold", fontSize: 14, marginTop: 3 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 8 },
  sourceRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingHorizontal: 4 },
  sourceText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17 },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 8 },
});