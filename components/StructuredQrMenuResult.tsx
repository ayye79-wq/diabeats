import React, { useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import { useApp, type DietGoal } from "@/context/AppContext";
import { getBloodSugarImpact, getWhyText, type Nutrient } from "@/lib/mealInsights";
import {
  calculateNetCarbohydrates,
  scoreStructuredQrMenuItem,
  type StructuredQrMenu,
  type StructuredQrMenuItem,
} from "@/shared/structured-qr-menu";

type Props = {
  menu: StructuredQrMenu;
  rawContent: string;
  dark?: boolean;
};

const GOAL_LABELS: Record<DietGoal, string> = {
  strict: "strict carb",
  balanced: "balanced",
  "weight-loss": "weight-loss",
};

function displayNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function nutrientsFor(item: StructuredQrMenuItem): Nutrient[] {
  return [
    { label: "Carbs", value: `${item.carbs_g}g` },
    { label: "Fiber", value: `${item.fiber_g}g` },
    { label: "Sugar", value: `${item.sugar_g}g` },
    { label: "Protein", value: `${item.protein_g}g` },
  ];
}

function MenuItemCard({
  item,
  dietGoal,
  dark,
}: {
  item: StructuredQrMenuItem;
  dietGoal: DietGoal;
  dark: boolean;
}) {
  const nutrients = useMemo(() => nutrientsFor(item), [item]);
  const impact = getBloodSugarImpact(nutrients, dietGoal);
  const why = getWhyText(nutrients);
  const score = scoreStructuredQrMenuItem(item);
  const text = dark ? "#F2FBF5" : "#102218";
  const muted = dark ? "#AAC2B1" : "#5E7165";
  const card = dark ? "#13261A" : "#FFFFFF";
  const border = dark ? "#294634" : "#DCEBE2";
  const nutrition = [
    ["Calories", displayNumber(item.calories)],
    ["Total carbs", `${displayNumber(item.carbs_g)}g`],
    ["Fiber", `${displayNumber(item.fiber_g)}g`],
    ["Net carbs", `${displayNumber(calculateNetCarbohydrates(item))}g`],
    ["Sugar", `${displayNumber(item.sugar_g)}g`],
    ["Protein", `${displayNumber(item.protein_g)}g`],
  ];

  return (
    <View style={[styles.itemCard, { backgroundColor: card, borderColor: border }]}>
      <View style={styles.itemHeading}>
        <Text style={[styles.itemName, { color: text }]}>{item.name}</Text>
        <View style={[styles.impactBadge, { backgroundColor: impact.badgeBg }]}>
          <Text style={[styles.impactBadgeText, { color: impact.badgeText }]}>{impact.label}</Text>
        </View>
      </View>

      <View style={styles.nutritionGrid}>
        {nutrition.map(([label, value]) => (
          <View key={label} style={[styles.nutrient, { borderColor: border }]}>
            <Text style={[styles.nutrientLabel, { color: muted }]}>{label}</Text>
            <Text style={[styles.nutrientValue, { color: text }]}>{value}</Text>
          </View>
        ))}
      </View>

      <View style={[styles.guidance, { backgroundColor: impact.rowBg }]}>
        <View style={styles.guidanceHeading}>
          <Ionicons name="pulse-outline" size={16} color={impact.badgeBg} />
          <Text style={[styles.guidanceTitle, { color: impact.badgeBg }]}>
            {score.score}/100 educational fit summary
          </Text>
        </View>
        <Text style={[styles.guidanceText, { color: text }]}>
            {impact.label.charAt(0) + impact.label.slice(1).toLowerCase()} meal-impact pattern for your{" "}
          {GOAL_LABELS[dietGoal]} goal. {why}.
        </Text>
      </View>
    </View>
  );
}

export function StructuredQrMenuResult({ menu, rawContent, dark = false }: Props) {
  const { dietGoal } = useApp();
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false);
  const text = dark ? "#F2FBF5" : "#102218";
  const muted = dark ? "#AAC2B1" : "#5E7165";
  const card = dark ? "#13261A" : "#FFFFFF";
  const border = dark ? "#294634" : "#DCEBE2";

  return (
    <View style={styles.wrap}>
      <View style={[styles.hero, { backgroundColor: card, borderColor: border }]}>
        <View style={styles.testBadge}>
          <Ionicons name="flask-outline" size={15} color="#92400E" />
          <Text style={styles.testBadgeText}>TEST · UNVERIFIED QR DATA</Text>
        </View>
        <Text style={[styles.eyebrow, { color: muted }]}>QR-provided restaurant menu</Text>
        <Text style={[styles.restaurantName, { color: text }]}>{menu.restaurant}</Text>
        <Text style={[styles.menuMeta, { color: muted }]}>
          {menu.items.length} {menu.items.length === 1 ? "menu item" : "menu items"} · Menu ID {menu.menu_id}
        </Text>
        <Text style={[styles.trustNotice, { color: muted }]}>
          Nutrition values came directly from this test QR code. They are not verified restaurant or
          product data and were not saved.
        </Text>
      </View>

      {menu.items.map((item) => (
        <MenuItemCard key={item.id} item={item} dietGoal={dietGoal} dark={dark} />
      ))}

      <View style={[styles.technicalCard, { backgroundColor: card, borderColor: border }]}>
        <Pressable
          onPress={() => setShowTechnicalDetails((current) => !current)}
          style={styles.technicalButton}
          accessibilityRole="button"
          accessibilityState={{ expanded: showTechnicalDetails }}
          accessibilityLabel={`${showTechnicalDetails ? "Collapse" : "Expand"} technical details`}
        >
          <View style={styles.technicalTitleRow}>
            <Ionicons name="code-slash-outline" size={18} color={Colors.brand.primary} />
            <Text style={[styles.technicalTitle, { color: text }]}>Technical details</Text>
          </View>
          <Ionicons
            name={showTechnicalDetails ? "chevron-up" : "chevron-down"}
            size={18}
            color={muted}
          />
        </Pressable>
        {showTechnicalDetails ? (
          <View style={[styles.rawContent, { backgroundColor: dark ? "#0B1810" : "#F7FDF9", borderColor: border }]}>
            <Text style={[styles.rawContentText, { color: text }]} selectable>
              {rawContent}
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={[styles.disclaimer, { color: muted }]}>
        Educational meal-impact summary only—not medical advice or a prediction of individual glucose response. Actual portions, preparation, and nutrition may differ.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 12 },
  hero: { borderWidth: 1, borderRadius: 18, padding: 18 },
  testBadge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#FEF3C7",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  testBadgeText: { color: "#92400E", fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.5 },
  eyebrow: { fontFamily: "Inter_600SemiBold", fontSize: 11, marginTop: 14, textTransform: "uppercase", letterSpacing: 0.6 },
  restaurantName: { fontFamily: "Inter_700Bold", fontSize: 24, lineHeight: 30, marginTop: 4 },
  menuMeta: { fontFamily: "Inter_500Medium", fontSize: 12, marginTop: 5 },
  trustNotice: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 14 },
  itemCard: { borderWidth: 1, borderRadius: 18, padding: 16 },
  itemHeading: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  itemName: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 18, lineHeight: 23 },
  impactBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  impactBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.4 },
  nutritionGrid: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  nutrient: { width: "33.333%", borderLeftWidth: 1, paddingHorizontal: 9, paddingVertical: 8 },
  nutrientLabel: { fontFamily: "Inter_400Regular", fontSize: 10 },
  nutrientValue: { fontFamily: "Inter_700Bold", fontSize: 15, marginTop: 3 },
  guidance: { borderRadius: 13, padding: 12, marginTop: 13 },
  guidanceHeading: { flexDirection: "row", alignItems: "center", gap: 6 },
  guidanceTitle: { fontFamily: "Inter_700Bold", fontSize: 12 },
  guidanceText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 5 },
  technicalCard: { borderWidth: 1, borderRadius: 16, padding: 14 },
  technicalButton: { minHeight: 32, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  technicalTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  technicalTitle: { fontFamily: "Inter_700Bold", fontSize: 14 },
  rawContent: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 12 },
  rawContentText: { fontFamily: "monospace", fontSize: 11, lineHeight: 17 },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, textAlign: "center", paddingHorizontal: 10 },
});