import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { NormalizedProduct } from "@/shared/biotrace";
import type { BioTraceRating } from "@/shared/biotrace-rating";
import Colors from "@/constants/colors";

type Props = {
  product: NormalizedProduct;
  rating: BioTraceRating;
  dark?: boolean;
  saved?: boolean;
  onSave?: () => void;
  onAlternatives?: () => void;
  onReport?: () => void;
};

const toneFor = (label: BioTraceRating["label"]) => {
  if (label === "better-fit") return { bg: "#DCFCE7", text: "#166534", icon: "checkmark-circle" as const };
  if (label === "use-with-caution") return { bg: "#FEF3C7", text: "#92400E", icon: "alert-circle" as const };
  if (label === "limit") return { bg: "#FEE2E2", text: "#991B1B", icon: "close-circle" as const };
  return { bg: "#E5E7EB", text: "#374151", icon: "information-circle" as const };
};

const value = (amount: number | null, unit: string) => (amount === null ? "—" : `${amount}${unit}`);

export function BioTraceResult({ product, rating, dark = false, saved, onSave, onAlternatives, onReport }: Props) {
  const tone = toneFor(rating.label);
  const text = dark ? "#F2FBF5" : "#102218";
  const muted = dark ? "#AAC2B1" : "#5E7165";
  const card = dark ? "#13261A" : "#FFFFFF";
  const border = dark ? "#294634" : "#DCEBE2";
  const nutrition = product.nutrition;
  const servingLabel =
    nutrition.basis === "serving"
      ? nutrition.servingSize ?? "per serving"
      : nutrition.servingQuantityGrams
        ? `per serving (${nutrition.servingQuantityGrams}g, calculated from 100g)`
        : "per 100g";

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: card, borderColor: border }]}>
        <View style={styles.heroTop}>
          <View style={styles.productCopy}>
            <Text style={[styles.eyebrow, { color: muted }]}>BioTrace product result</Text>
            <Text style={[styles.name, { color: text }]}>{product.name}</Text>
            <Text style={[styles.brand, { color: muted }]}>
              {[product.brand, product.quantity].filter(Boolean).join(" · ") || "Brand not listed"}
            </Text>
          </View>
          <View style={[styles.score, { backgroundColor: tone.bg }]}>
            <Ionicons name={tone.icon} size={19} color={tone.text} />
            <Text style={[styles.scoreText, { color: tone.text }]}>{rating.display}</Text>
          </View>
        </View>
        <Text style={[styles.summary, { color: text }]}>{rating.summary}</Text>
        <Text style={[styles.basis, { color: muted }]}>Values shown {servingLabel}</Text>
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.sectionTitle, { color: text }]}>Nutrition snapshot</Text>
        <View style={styles.nutrients}>
          {[
            ["Carbs", value(nutrition.carbohydratesGrams, "g")],
            ["Sugars", value(nutrition.sugarsGrams, "g")],
            ["Fiber", value(nutrition.fiberGrams, "g")],
            ["Protein", value(nutrition.proteinGrams, "g")],
            ["Sat. fat", value(nutrition.saturatedFatGrams, "g")],
            ["Sodium", value(nutrition.sodiumMilligrams, "mg")],
          ].map(([label, amount]) => (
            <View key={label} style={[styles.nutrient, { borderColor: border }]}>
              <Text style={[styles.nutrientLabel, { color: muted }]}>{label}</Text>
              <Text style={[styles.nutrientValue, { color: text }]}>{amount}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.sectionTitle, { color: text }]}>Why this rating</Text>
        {rating.factors.length ? (
          rating.factors.map((factor) => {
            const color =
              factor.impact === "positive" ? "#166534" : factor.impact === "negative" ? "#991B1B" : factor.impact === "caution" ? "#92400E" : muted;
            const icon = factor.impact === "positive" ? "checkmark-circle" : factor.impact === "negative" ? "close-circle" : "information-circle";
            return (
              <View key={factor.key} style={styles.factor}>
                <Ionicons name={icon} size={17} color={color} />
                <Text style={[styles.factorText, { color: text }]}>{factor.label}</Text>
              </View>
            );
          })
        ) : (
          <Text style={[styles.emptyFactors, { color: muted }]}>No rating factors were available from this label.</Text>
        )}
      </View>

      <View style={[styles.card, { backgroundColor: card, borderColor: border }]}>
        <Text style={[styles.sectionTitle, { color: text }]}>Ingredients & transparency</Text>
        <Text style={[styles.detail, { color: muted }]}>
          GMO: {product.gmo.status.replace("-", " ")} — {product.gmo.reason}
        </Text>
        <Text style={[styles.detail, { color: muted }]}>
          {product.ingredients.hasArtificialSweeteners
            ? "Contains artificial sweeteners."
            : product.ingredients.hasSweeteners
              ? "Contains sweeteners."
              : "No recognized sweeteners were found in the listed ingredients."}
        </Text>
        <Text style={[styles.detail, { color: muted }]}>
          {product.ingredients.additives.length
            ? `${product.ingredients.additives.length} additive(s) flagged from the provider ingredient data.`
            : "No additives were flagged from the provider ingredient data."}
        </Text>
        {product.ingredientsText ? (
          <Text style={[styles.ingredientsText, { color: muted }]} numberOfLines={5}>
            Ingredients: {product.ingredientsText}
          </Text>
        ) : null}
        {product.source.url ? (
          <Pressable onPress={() => Linking.openURL(product.source.url!)} style={styles.sourceLink}>
            <Ionicons name="open-outline" size={15} color={Colors.brand.primary} />
            <Text style={styles.sourceLinkText}>View source on Open Food Facts</Text>
          </Pressable>
        ) : null}
      </View>

      <View style={styles.actions}>
        <Pressable onPress={onSave} style={[styles.action, styles.primaryAction]}>
          <Ionicons name={saved ? "bookmark" : "bookmark-outline"} size={17} color="#fff" />
          <Text style={styles.primaryActionText}>{saved ? "Saved" : "Save food"}</Text>
        </Pressable>
        <Pressable onPress={onAlternatives} style={[styles.action, { borderColor: Colors.brand.primary }]}>
          <Ionicons name="swap-horizontal-outline" size={18} color={Colors.brand.primary} />
          <Text style={styles.secondaryActionText}>Alternatives</Text>
        </Pressable>
      </View>
      <Pressable onPress={onReport} style={styles.report}>
        <Text style={[styles.reportText, { color: muted }]}>Report a data issue</Text>
      </Pressable>
      <Text style={[styles.disclaimer, { color: muted }]}>{rating.disclaimer}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { borderWidth: 1, borderRadius: 18, padding: 18 },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "flex-start" },
  productCopy: { flex: 1 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.6, textTransform: "uppercase" },
  name: { fontFamily: "Inter_700Bold", fontSize: 23, lineHeight: 29, marginTop: 4 },
  brand: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 4 },
  score: { maxWidth: 132, borderRadius: 12, paddingHorizontal: 9, paddingVertical: 8, alignItems: "center", gap: 3 },
  scoreText: { fontFamily: "Inter_700Bold", fontSize: 12, textAlign: "center" },
  summary: { fontFamily: "Inter_500Medium", fontSize: 14, lineHeight: 21, marginTop: 16 },
  basis: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 8 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 12 },
  nutrients: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -4 },
  nutrient: { width: "33.333%", paddingHorizontal: 8, paddingVertical: 8, borderLeftWidth: 1 },
  nutrientLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  nutrientValue: { fontFamily: "Inter_700Bold", fontSize: 15, marginTop: 3 },
  factor: { flexDirection: "row", gap: 9, alignItems: "flex-start", paddingVertical: 5 },
  factorText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  emptyFactors: { fontFamily: "Inter_400Regular", fontSize: 13 },
  detail: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginBottom: 6 },
  ingredientsText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 6 },
  sourceLink: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12 },
  sourceLinkText: { fontFamily: "Inter_600SemiBold", color: Colors.brand.primary, fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  action: { flex: 1, minHeight: 46, borderWidth: 1, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  primaryAction: { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary },
  primaryActionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  secondaryActionText: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 13 },
  report: { alignSelf: "center", padding: 7 },
  reportText: { fontFamily: "Inter_500Medium", fontSize: 12, textDecorationLine: "underline" },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 8 },
});