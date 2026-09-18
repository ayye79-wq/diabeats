import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import {
  INGREDIENT_ANALYSIS_DISCLAIMER,
  type BloodSugarRelevance,
  type IngredientAnalysis,
  type IngredientCategory,
} from "@/shared/biotrace-ingredients";

type Props = {
  analysis: IngredientAnalysis;
  dark?: boolean;
};

function categoryIcon(category: IngredientCategory) {
  switch (category) {
    case "recognized-sugar":
    case "syrup":
    case "maltodextrin":
      return "flame-outline" as const;
    case "refined-starch":
      return "layers-outline" as const;
    case "sugar-alcohol":
    case "artificial-sweetener":
    case "novel-sweetener":
      return "flask-outline" as const;
    case "fiber":
      return "leaf-outline" as const;
    case "protein-or-fat":
      return "nutrition-outline" as const;
    case "preservative":
      return "time-outline" as const;
    case "color":
      return "color-palette-outline" as const;
    case "flavor-enhancer":
    case "flavoring-or-base":
      return "sparkles-outline" as const;
    case "texture-agent":
      return "water-outline" as const;
    case "acid-regulator":
      return "beaker-outline" as const;
    case "leavening-agent":
      return "arrow-up-circle-outline" as const;
    case "vitamin-or-mineral":
      return "medkit-outline" as const;
    default:
      return "help-circle-outline" as const;
  }
}

function relevanceTone(relevance: BloodSugarRelevance) {
  if (relevance === "direct") return { color: "#991B1B", label: "Directly affects blood sugar" };
  if (relevance === "indirect") return { color: "#92400E", label: "May affect blood sugar" };
  if (relevance === "minimal") return { color: "#166534", label: "Minimal blood sugar effect" };
  return { color: "#4B6957", label: "Blood sugar effect unknown" };
}

/**
 * Renders the shared BioTrace ingredient-analysis engine's output. Used by
 * both the verified barcode/QR result and the label-photo result so every
 * entry point explains ingredients the same way.
 */
export function IngredientAnalysisSection({ analysis, dark = false }: Props) {
  const c = dark ? Colors.dark : Colors.light;

  return (
    <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
      <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>What's in this product</Text>
      <Text style={[styles.summary, { color: c.textSecondary }]}>{analysis.summary}</Text>

      {analysis.ingredients.length ? (
        analysis.ingredients.map((ingredient) => {
          const tone = relevanceTone(ingredient.bloodSugarRelevance);
          return (
            <View key={ingredient.name} style={styles.row}>
              <Ionicons name={categoryIcon(ingredient.category)} size={17} color={Colors.brand.primary} style={styles.rowIcon} />
              <View style={styles.rowCopy}>
                <Text style={[styles.ingredientName, { color: c.textPrimary }]}>{ingredient.name}</Text>
                <Text style={[styles.explanation, { color: c.textSecondary }]}>{ingredient.explanation}</Text>
                {ingredient.bloodSugarNote ? (
                  <View style={styles.relevanceRow}>
                    <View style={[styles.relevanceDot, { backgroundColor: tone.color }]} />
                    <Text style={[styles.relevanceText, { color: tone.color }]}>{tone.label}: </Text>
                    <Text style={[styles.relevanceNote, { color: c.textSecondary }]}>{ingredient.bloodSugarNote}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          );
        })
      ) : (
        <Text style={[styles.emptyText, { color: c.textSecondary }]}>No ingredient list was available to analyze.</Text>
      )}

      {analysis.sourceText ? (
        <Text style={[styles.sourceText, { color: c.textMuted }]} numberOfLines={4}>
          Full ingredient list: {analysis.sourceText}
        </Text>
      ) : null}
      <Text style={[styles.disclaimer, { color: c.textMuted }]}>{INGREDIENT_ANALYSIS_DISCLAIMER}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: 16, padding: 15 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 6 },
  summary: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginBottom: 10 },
  row: { flexDirection: "row", gap: 9, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(139,168,152,0.25)" },
  rowIcon: { marginTop: 2 },
  rowCopy: { flex: 1 },
  ingredientName: { fontFamily: "Inter_700Bold", fontSize: 13 },
  explanation: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 2 },
  relevanceRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 4 },
  relevanceDot: { width: 7, height: 7, borderRadius: 4, marginRight: 6, marginTop: 5 },
  relevanceText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  relevanceNote: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, flexShrink: 1 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  sourceText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17, marginTop: 10 },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 10 },
});
