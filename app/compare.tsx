import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { RESTAURANTS } from "@/data/restaurants";
import { ScoreTag } from "@/components/ScoreTag";
import { useApp } from "@/context/AppContext";

function parseGrams(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

function getNutrient(nutrients: { label: string; value: string }[], key: string): number | null {
  const found = nutrients.find((n) => n.label.toLowerCase().includes(key.toLowerCase()));
  return found ? parseGrams(found.value) : null;
}

function parseCarbMidpoint(carbRange: string): number | null {
  const nums = carbRange.match(/\d+/g);
  if (!nums) return null;
  const vals = nums.map(Number);
  return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
}

function estimateSpike(nutrients: { label: string; value: string }[], carbRange: string): number {
  const carbs = getNutrient(nutrients, "carb") ?? parseCarbMidpoint(carbRange) ?? 0;
  const fiber = getNutrient(nutrients, "fiber") ?? 0;
  const protein = getNutrient(nutrients, "protein") ?? 0;
  const net = Math.max(0, carbs - fiber);
  let rise = Math.round(net * 3.8);
  if (protein > 20) rise = Math.round(rise * 0.92);
  return Math.max(5, Math.min(rise, 90));
}

interface MealOption {
  restaurantId: string;
  itemId: string;
  restaurantName: string;
  mealName: string;
  diabeticScore: "good" | "caution" | "avoid";
  carbRange: string;
}

export default function CompareScreen() {
  const { restaurantId, itemId } = useLocalSearchParams<{ restaurantId: string; itemId: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const { recentlyViewed } = useApp();

  const meal1Restaurant = useMemo(() => RESTAURANTS.find((r) => r.id === restaurantId), [restaurantId]);
  const meal1 = useMemo(() => meal1Restaurant?.menuItems.find((m) => m.id === itemId), [meal1Restaurant, itemId]);

  const [meal2Key, setMeal2Key] = useState<{ restaurantId: string; itemId: string } | null>(null);
  const meal2Restaurant = useMemo(
    () => (meal2Key ? RESTAURANTS.find((r) => r.id === meal2Key.restaurantId) : null),
    [meal2Key]
  );
  const meal2 = useMemo(
    () => meal2Restaurant?.menuItems.find((m) => m.id === meal2Key?.itemId),
    [meal2Restaurant, meal2Key]
  );

  const pickerMeals = useMemo<MealOption[]>(() => {
    const seen = new Set<string>();
    const out: MealOption[] = [];

    for (const rv of recentlyViewed) {
      const key = `${rv.restaurantId}/${rv.menuItemId}`;
      if (seen.has(key) || rv.menuItemId === itemId) continue;
      seen.add(key);
      out.push({
        restaurantId: rv.restaurantId,
        itemId: rv.menuItemId,
        restaurantName: rv.restaurantName,
        mealName: rv.mealName,
        diabeticScore: rv.diabeticScore,
        carbRange: rv.carbRange,
      });
    }

    for (const r of RESTAURANTS) {
      for (const m of r.menuItems) {
        const key = `${r.id}/${m.id}`;
        if (seen.has(key) || m.id === itemId) continue;
        if (m.diabeticScore === "avoid") continue;
        seen.add(key);
        out.push({
          restaurantId: r.id,
          itemId: m.id,
          restaurantName: r.name,
          mealName: m.name,
          diabeticScore: m.diabeticScore as "good" | "caution" | "avoid",
          carbRange: m.carbRange,
        });
      }
    }
    return out;
  }, [recentlyViewed, itemId]);

  if (!meal1 || !meal1Restaurant) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <Text style={{ color: c.textMuted, textAlign: "center", marginTop: 60 }}>Meal not found</Text>
      </View>
    );
  }

  const spike1 = estimateSpike(meal1.nutrients as any, meal1.carbRange);
  const spike2 = meal2 ? estimateSpike(meal2.nutrients as any, meal2.carbRange) : null;

  const nutrients1 = meal1.nutrients as { label: string; value: string }[];
  const nutrients2 = meal2 ? (meal2.nutrients as { label: string; value: string }[]) : null;

  const ROWS = [
    { label: "Estimated spike", key: "spike" },
    { label: "Carb range", key: "carbRange" },
    { label: "Carbs", key: "carbs" },
    { label: "Fiber", key: "fiber" },
    { label: "Protein", key: "protein" },
    { label: "Calories", key: "calories" },
  ];

  function getCellValue(key: string, idx: 1 | 2): string {
    const nut = idx === 1 ? nutrients1 : nutrients2;
    const meal = idx === 1 ? meal1 : meal2;
    const spike = idx === 1 ? spike1 : spike2;
    if (!meal || !nut) return "—";
    switch (key) {
      case "spike": return `+${spike} mg/dL`;
      case "carbRange": return meal.carbRange;
      case "carbs": return nut.find((n) => n.label.toLowerCase().includes("carb"))?.value ?? "—";
      case "fiber": return nut.find((n) => n.label.toLowerCase().includes("fiber"))?.value ?? "—";
      case "protein": return nut.find((n) => n.label.toLowerCase().includes("protein"))?.value ?? "—";
      case "calories": return nut.find((n) => n.label.toLowerCase().includes("calor"))?.value ?? "—";
      default: return "—";
    }
  }

  function getBetter(key: string): 1 | 2 | null {
    if (!meal2 || !nutrients2) return null;
    const v1 = key === "spike"
      ? spike1
      : key === "carbRange"
      ? parseCarbMidpoint(meal1!.carbRange) ?? Infinity
      : getNutrient(nutrients1, key === "carbs" ? "carb" : key === "calories" ? "calor" : key) ?? null;
    const v2 = key === "spike"
      ? spike2!
      : key === "carbRange"
      ? parseCarbMidpoint(meal2.carbRange) ?? Infinity
      : getNutrient(nutrients2, key === "carbs" ? "carb" : key === "calories" ? "calor" : key) ?? null;
    if (v1 === null || v2 === null) return null;
    if (key === "protein" || key === "fiber") return v1 > v2 ? 1 : v1 < v2 ? 2 : null;
    return v1 < v2 ? 1 : v1 > v2 ? 2 : null;
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 6, borderBottomColor: c.border }]}>
        <View style={styles.headerRow}>
          <View style={styles.headerIcon}>
            <Ionicons name="git-compare-outline" size={18} color={Colors.brand.primary} />
          </View>
          <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Meal Comparison</Text>
          <Pressable onPress={() => router.back()} hitSlop={12}>
            <Ionicons name="close" size={22} color={c.textMuted} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { paddingBottom: (Platform.OS === "web" ? 34 : insets.bottom) + 24 }]}
      >
        {/* Meal headers */}
        <View style={styles.mealHeaderRow}>
          <View style={[styles.mealHeaderCard, { backgroundColor: c.cardBg, borderColor: Colors.brand.primary + "40" }]}>
            <ScoreTag score={meal1.diabeticScore as any} size="sm" />
            <Text style={[styles.mealHeaderName, { color: c.textPrimary }]} numberOfLines={2}>{meal1.name}</Text>
            <Text style={[styles.mealHeaderRest, { color: c.textMuted }]} numberOfLines={1}>{meal1Restaurant.name}</Text>
          </View>

          <View style={styles.vsCol}>
            <Text style={[styles.vsText, { color: c.textMuted }]}>vs</Text>
          </View>

          {meal2 && meal2Restaurant ? (
            <Pressable
              style={[styles.mealHeaderCard, { backgroundColor: c.cardBg, borderColor: c.border }]}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setMeal2Key(null); }}
            >
              <ScoreTag score={meal2.diabeticScore as any} size="sm" />
              <Text style={[styles.mealHeaderName, { color: c.textPrimary }]} numberOfLines={2}>{meal2.name}</Text>
              <Text style={[styles.mealHeaderRest, { color: c.textMuted }]} numberOfLines={1}>{meal2Restaurant.name}</Text>
              <Text style={[styles.tapToChange, { color: Colors.brand.primary }]}>Tap to change</Text>
            </Pressable>
          ) : (
            <View style={[styles.mealHeaderCard, styles.mealPickerEmpty, { backgroundColor: c.cardBg, borderColor: c.border, borderStyle: "dashed" }]}>
              <Ionicons name="add-circle-outline" size={22} color={c.textMuted} />
              <Text style={[styles.pickLabel, { color: c.textMuted }]}>Pick a meal below</Text>
            </View>
          )}
        </View>

        {/* Comparison table */}
        {meal2 && (
          <View style={[styles.table, { borderColor: c.border }]}>
            {ROWS.map((row, idx) => {
              const better = getBetter(row.key);
              const isFirst = idx === 0;
              return (
                <View
                  key={row.key}
                  style={[
                    styles.tableRow,
                    !isFirst && { borderTopWidth: 1, borderTopColor: c.border },
                  ]}
                >
                  <Text style={[styles.tableRowLabel, { color: c.textMuted }]}>{row.label}</Text>
                  <View style={styles.tableCells}>
                    <View style={[styles.tableCell, better === 1 && { backgroundColor: Colors.brand.goodLight + "80" }]}>
                      {better === 1 && <Ionicons name="trending-down" size={12} color={Colors.brand.goodText} />}
                      <Text style={[styles.tableCellText, { color: better === 1 ? Colors.brand.goodText : c.textPrimary }]}>
                        {getCellValue(row.key, 1)}
                      </Text>
                    </View>
                    <View style={[styles.tableCell, better === 2 && { backgroundColor: Colors.brand.goodLight + "80" }]}>
                      {better === 2 && <Ionicons name="trending-down" size={12} color={Colors.brand.goodText} />}
                      <Text style={[styles.tableCellText, { color: better === 2 ? Colors.brand.goodText : c.textPrimary }]}>
                        {getCellValue(row.key, 2)}
                      </Text>
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}

        {/* Meal picker */}
        {!meal2 && (
          <>
            <Text style={[styles.pickerTitle, { color: c.textMuted }]}>SELECT A MEAL TO COMPARE</Text>
            {pickerMeals.map((opt) => (
              <Pressable
                key={`${opt.restaurantId}/${opt.itemId}`}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setMeal2Key({ restaurantId: opt.restaurantId, itemId: opt.itemId });
                }}
                style={[styles.pickerRow, { backgroundColor: c.cardBg, borderColor: c.border }]}
              >
                <View style={[styles.pickerScore, {
                  backgroundColor: opt.diabeticScore === "good" ? Colors.brand.goodLight : opt.diabeticScore === "caution" ? Colors.brand.cautionLight : Colors.brand.avoidLight,
                }]}>
                  <Ionicons
                    name={opt.diabeticScore === "good" ? "checkmark" : opt.diabeticScore === "caution" ? "warning" : "close"}
                    size={12}
                    color={opt.diabeticScore === "good" ? Colors.brand.goodText : opt.diabeticScore === "caution" ? Colors.brand.cautionText : Colors.brand.avoidText}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerMealName, { color: c.textPrimary }]} numberOfLines={1}>{opt.mealName}</Text>
                  <Text style={[styles.pickerRestName, { color: c.textMuted }]} numberOfLines={1}>{opt.restaurantName} · {opt.carbRange}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14, borderBottomWidth: 1 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  headerIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: "#dcfce7", alignItems: "center", justifyContent: "center" },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18, flex: 1 },
  scroll: { padding: 16, gap: 14 },
  mealHeaderRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  mealHeaderCard: { flex: 1, borderRadius: 14, borderWidth: 1, padding: 12, gap: 6 },
  mealPickerEmpty: { alignItems: "center", justifyContent: "center", minHeight: 100 },
  mealHeaderName: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 19 },
  mealHeaderRest: { fontFamily: "Inter_400Regular", fontSize: 12 },
  tapToChange: { fontFamily: "Inter_500Medium", fontSize: 11, marginTop: 2 },
  vsCol: { alignItems: "center", justifyContent: "center", paddingTop: 36, width: 28 },
  vsText: { fontFamily: "Inter_700Bold", fontSize: 13 },
  pickLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 6, textAlign: "center" },
  table: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  tableRow: { flexDirection: "column", padding: 12, gap: 8 },
  tableRowLabel: { fontFamily: "Inter_500Medium", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.6 },
  tableCells: { flexDirection: "row", gap: 8 },
  tableCell: { flex: 1, flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7 },
  tableCellText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  pickerTitle: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8, marginTop: 4 },
  pickerRow: { flexDirection: "row", alignItems: "center", gap: 12, borderRadius: 12, borderWidth: 1, padding: 12 },
  pickerScore: { width: 28, height: 28, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  pickerMealName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  pickerRestName: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
});
