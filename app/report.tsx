import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Share,
  Linking,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";

import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import type { MealLogEntry } from "@/context/AppContext";

type Period = "month" | "lastMonth" | "allTime";

function parseCarbMidpoint(carbRange: string): number | null {
  const nums = carbRange.match(/\d+/g);
  if (!nums) return null;
  if (nums.length >= 2) return (parseInt(nums[0]) + parseInt(nums[1])) / 2;
  return parseInt(nums[0]);
}

function filterByPeriod(log: MealLogEntry[], period: Period): MealLogEntry[] {
  const now = new Date();
  if (period === "allTime") return log;
  const target = new Date(now);
  if (period === "lastMonth") target.setMonth(target.getMonth() - 1);
  return log.filter((e) => {
    const d = new Date(e.loggedAt);
    return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth();
  });
}

function getPeriodLabel(period: Period): string {
  const now = new Date();
  if (period === "allTime") return "All Time";
  const target = new Date(now);
  if (period === "lastMonth") target.setMonth(target.getMonth() - 1);
  return target.toLocaleString("default", { month: "long", year: "numeric" });
}

function getRestaurantFrequency(log: MealLogEntry[]): { name: string; count: number }[] {
  const counts: Record<string, number> = {};
  for (const e of log) counts[e.restaurantName] = (counts[e.restaurantName] || 0) + 1;
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
}

function generatePatterns(log: MealLogEntry[]): string[] {
  if (log.length === 0) return [];
  const patterns: string[] = [];

  const goodCount = log.filter((e) => e.diabeticScore === "good").length;
  const goodPct = Math.round((goodCount / log.length) * 100);
  if (goodPct >= 60) {
    patterns.push(`${goodPct}% of logged meals had low blood sugar impact — strong consistency`);
  } else if (goodPct >= 40) {
    patterns.push(`${goodPct}% of logged meals were low-impact — there's room to improve further`);
  } else {
    patterns.push(`Only ${goodPct}% of logged meals were low-impact — consider more salad or protein-based choices`);
  }

  const restaurantCounts: Record<string, { good: number; total: number }> = {};
  for (const e of log) {
    if (!restaurantCounts[e.restaurantName]) restaurantCounts[e.restaurantName] = { good: 0, total: 0 };
    restaurantCounts[e.restaurantName].total++;
    if (e.diabeticScore === "good") restaurantCounts[e.restaurantName].good++;
  }
  const bestRestaurant = Object.entries(restaurantCounts)
    .filter(([, v]) => v.total >= 2)
    .sort(([, a], [, b]) => b.good / b.total - a.good / a.total)[0];
  if (bestRestaurant) {
    const pct = Math.round((bestRestaurant[1].good / bestRestaurant[1].total) * 100);
    patterns.push(`${bestRestaurant[0]} had the best low-impact rate among your regular restaurants (${pct}%)`);
  }

  const avoidEntries = log.filter((e) => e.diabeticScore === "avoid");
  if (avoidEntries.length > 0) {
    const topAvoidRestaurant = avoidEntries.reduce<Record<string, number>>((acc, e) => {
      acc[e.restaurantName] = (acc[e.restaurantName] || 0) + 1;
      return acc;
    }, {});
    const top = Object.entries(topAvoidRestaurant).sort((a, b) => b[1] - a[1])[0];
    if (top[1] >= 2) patterns.push(`${top[0]}: ${top[1]} high-impact meals logged — consider lower-carb alternatives there`);
  }

  const withOutcomes = log.filter((e) => e.outcome && e.outcome !== "not_measured");
  if (withOutcomes.length >= 2) {
    const stableCount = withOutcomes.filter((e) => e.outcome === "good").length;
    patterns.push(`${stableCount} of ${withOutcomes.length} tracked meals showed stable blood sugar response`);
  }

  const carbs = log.map((e) => parseCarbMidpoint(e.carbRange)).filter((n): n is number => n !== null);
  if (carbs.length >= 3) {
    const avg = Math.round(carbs.reduce((a, b) => a + b, 0) / carbs.length);
    const ADA_TARGET = 45;
    if (avg > ADA_TARGET) {
      patterns.push(`Average ~${avg}g carbs per meal — the ADA recommends 45–60g per meal for most people with diabetes`);
    } else {
      patterns.push(`Average ~${avg}g carbs per meal — well within a diabetes-friendly range`);
    }
  }

  return patterns.slice(0, 4);
}

function buildShareText(
  log: MealLogEntry[],
  period: string,
  restaurants: { name: string; count: number }[],
  patterns: string[],
  avgCarbs: number | null,
  breakdown: { good: number; caution: number; avoid: number }
): string {
  const now = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const lines: string[] = [
    "My DiabEats Weekly Summary",
    `Period: ${period}`,
    `Generated: ${now}`,
    "",
    `Safe meals: ${breakdown.good}`,
    `Moderate meals: ${breakdown.caution}`,
    `Higher impact meals: ${breakdown.avoid}`,
    avgCarbs !== null ? `Average carbs per meal: ~${avgCarbs}g` : null,
  ].filter(Boolean) as string[];

  if (restaurants.length > 0) {
    lines.push("", "Restaurants visited:");
    restaurants.forEach((r, i) => lines.push(`${i + 1}. ${r.name} — ${r.count} visit${r.count !== 1 ? "s" : ""}`));
  }

  if (patterns.length > 0) {
    lines.push("", "Dining patterns:");
    patterns.forEach((p) => lines.push(`• ${p}`));
  }

  lines.push(
    "",
    "---",
    "Generated with DiabEats.",
    "For informational purposes only. Not a substitute for medical advice."
  );

  return lines.join("\n");
}

const PERIODS: { id: Period; label: string }[] = [
  { id: "month", label: "This Month" },
  { id: "lastMonth", label: "Last Month" },
  { id: "allTime", label: "All Time" },
];

export default function ReportScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { mealLog } = useApp();
  const [period, setPeriod] = useState<Period>("month");

  const filteredLog = useMemo(() => filterByPeriod(mealLog, period), [mealLog, period]);
  const periodLabel = useMemo(() => getPeriodLabel(period), [period]);

  const breakdown = useMemo(
    () => ({
      good: filteredLog.filter((e) => e.diabeticScore === "good").length,
      caution: filteredLog.filter((e) => e.diabeticScore === "caution").length,
      avoid: filteredLog.filter((e) => e.diabeticScore === "avoid").length,
    }),
    [filteredLog]
  );

  const avgCarbs = useMemo(() => {
    const carbs = filteredLog
      .map((e) => parseCarbMidpoint(e.carbRange))
      .filter((n): n is number => n !== null);
    if (carbs.length === 0) return null;
    return Math.round(carbs.reduce((a, b) => a + b, 0) / carbs.length);
  }, [filteredLog]);

  const restaurants = useMemo(() => getRestaurantFrequency(filteredLog), [filteredLog]);
  const patterns = useMemo(() => generatePatterns(filteredLog), [filteredLog]);

  const outcomesTracked = useMemo(
    () => filteredLog.filter((e) => e.outcome && e.outcome !== "not_measured"),
    [filteredLog]
  );

  const total = filteredLog.length;
  const barTotal = Math.max(breakdown.good + breakdown.caution + breakdown.avoid, 1);

  const handleShare = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const text = buildShareText(filteredLog, periodLabel, restaurants, patterns, avgCarbs, breakdown);
    try {
      await Share.share({ message: text, title: `DiabEats Dining Report — ${periodLabel}` });
    } catch {
      // user cancelled
    }
  }, [filteredLog, periodLabel, restaurants, patterns, avgCarbs, breakdown]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={["#0E2016", "#166534"]}
        style={[styles.header, { paddingTop: topPad + 8 }]}
      >
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="report-back">
            <Ionicons name="arrow-back" size={22} color="#fff" />
          </Pressable>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerTitle}>Your Weekly Dining Summary</Text>
            <Text style={styles.headerSub}>A breakdown of how your restaurant choices may impact blood sugar.</Text>
          </View>
          <Pressable
            onPress={handleShare}
            hitSlop={8}
            style={styles.shareHeaderBtn}
            testID="share-report-header"
          >
            <Ionicons name="share-outline" size={20} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.periodRow}>
          {PERIODS.map((p) => (
            <Pressable
              key={p.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setPeriod(p.id);
              }}
              style={[
                styles.periodBtn,
                period === p.id && styles.periodBtnActive,
              ]}
              testID={`period-${p.id}`}
            >
              <Text style={[styles.periodBtnText, period === p.id && styles.periodBtnTextActive]}>
                {p.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </LinearGradient>

      {total === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="bar-chart-outline" size={52} color={c.border} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No meals logged yet</Text>
          <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>
            Start discovering diabetes-friendly dishes nearby and your weekly summary will appear here.
          </Text>
          <Pressable
            onPress={() => { router.back(); }}
            style={[styles.emptyBtn, { backgroundColor: Colors.brand.primary }]}
          >
            <Ionicons name="navigate-outline" size={14} color="#fff" />
            <Text style={styles.emptyBtnText}>Find Safe Meals Near Me</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.scroll, { paddingBottom: bottomPad + 32 }]}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.statsGrid}>
            <View style={[styles.statTile, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.statTileValue, { color: c.textPrimary }]}>{total}</Text>
              <Text style={[styles.statTileLabel, { color: c.textMuted }]}>Meals Logged</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.statTileValue, { color: c.textPrimary }]}>
                {avgCarbs !== null ? `~${avgCarbs}g` : "—"}
              </Text>
              <Text style={[styles.statTileLabel, { color: c.textMuted }]}>Avg Carbs</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: "#dcfce7", borderColor: "#bbf7d0" }]}>
              <Text style={[styles.statTileValue, { color: "#15803d" }]}>{breakdown.good}</Text>
              <Text style={[styles.statTileLabel, { color: "#15803d" }]}>Safe Meals</Text>
            </View>
            <View style={[styles.statTile, { backgroundColor: "#fee2e2", borderColor: "#fca5a5" }]}>
              <Text style={[styles.statTileValue, { color: "#991b1b" }]}>{breakdown.avoid}</Text>
              <Text style={[styles.statTileLabel, { color: "#991b1b" }]}>High Impact</Text>
            </View>
          </View>

          <View style={[styles.section, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Meal Impact Breakdown</Text>
            <View style={styles.distributionBar}>
              {breakdown.good > 0 && (
                <View style={[styles.barSegment, { flex: breakdown.good / barTotal, backgroundColor: "#22c55e" }]} />
              )}
              {breakdown.caution > 0 && (
                <View style={[styles.barSegment, { flex: breakdown.caution / barTotal, backgroundColor: "#eab308" }]} />
              )}
              {breakdown.avoid > 0 && (
                <View style={[styles.barSegment, { flex: breakdown.avoid / barTotal, backgroundColor: "#ef4444" }]} />
              )}
            </View>
            <View style={styles.legendRow}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#22c55e" }]} />
                <Text style={[styles.legendText, { color: c.textSecondary }]}>
                  Safe Choices ({breakdown.good})
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#eab308" }]} />
                <Text style={[styles.legendText, { color: c.textSecondary }]}>
                  Moderate Impact ({breakdown.caution})
                </Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: "#ef4444" }]} />
                <Text style={[styles.legendText, { color: c.textSecondary }]}>
                  Higher Impact ({breakdown.avoid})
                </Text>
              </View>
            </View>
          </View>

          {restaurants.length > 0 && (
            <View style={[styles.section, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Restaurant Choices</Text>
              {restaurants.map((r, i) => (
                <View key={r.name} style={[styles.restaurantRow, i < restaurants.length - 1 && { borderBottomWidth: 1, borderBottomColor: c.border }]}>
                  <View style={[styles.rankBadge, { backgroundColor: i === 0 ? Colors.brand.primary : c.background }]}>
                    <Text style={[styles.rankText, { color: i === 0 ? "#fff" : c.textMuted }]}>{i + 1}</Text>
                  </View>
                  <Text style={[styles.restaurantName, { color: c.textPrimary }]}>{r.name}</Text>
                  <View style={styles.visitBadge}>
                    <Text style={[styles.visitCount, { color: c.textMuted }]}>
                      {r.count} visit{r.count !== 1 ? "s" : ""}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {patterns.length > 0 && (
            <View style={[styles.section, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Dining Pattern</Text>
              {patterns.map((p, i) => (
                <View key={i} style={styles.patternRow}>
                  <View style={styles.patternDot} />
                  <Text style={[styles.patternText, { color: c.textSecondary }]}>{p}</Text>
                </View>
              ))}
            </View>
          )}

          {outcomesTracked.length > 0 && (
            <View style={[styles.section, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Blood Sugar Outcomes</Text>
              <View style={styles.outcomesGrid}>
                {(["good", "slight_spike", "high_spike"] as const).map((outcome) => {
                  const count = outcomesTracked.filter((e) => e.outcome === outcome).length;
                  const CONFIG = {
                    good: { label: "Stable", bg: "#dcfce7", text: "#15803d", icon: "checkmark-circle-outline" },
                    slight_spike: { label: "Slight Spike", bg: "#fef9c3", text: "#854d0e", icon: "trending-up-outline" },
                    high_spike: { label: "High Spike", bg: "#fee2e2", text: "#991b1b", icon: "arrow-up-circle-outline" },
                  } as const;
                  const cfg = CONFIG[outcome];
                  return (
                    <View key={outcome} style={[styles.outcomeTile, { backgroundColor: cfg.bg }]}>
                      <Ionicons name={cfg.icon} size={18} color={cfg.text} />
                      <Text style={[styles.outcomeCount, { color: cfg.text }]}>{count}</Text>
                      <Text style={[styles.outcomeLabel, { color: cfg.text }]}>{cfg.label}</Text>
                    </View>
                  );
                })}
              </View>
              <Text style={[styles.outcomeNote, { color: c.textMuted }]}>
                Based on {outcomesTracked.length} tracked outcome{outcomesTracked.length !== 1 ? "s" : ""}
              </Text>
            </View>
          )}

          <Pressable
            onPress={handleShare}
            style={({ pressed }) => [
              styles.shareBtn,
              { backgroundColor: Colors.brand.primary, opacity: pressed ? 0.88 : 1 },
            ]}
            testID="share-with-doctor-btn"
          >
            <Ionicons name="share-social-outline" size={20} color="#fff" />
            <View>
              <Text style={styles.shareBtnTitle}>Share My Dining Summary</Text>
              <Text style={styles.shareBtnSub}>Send as text via email, message, or to your doctor</Text>
            </View>
          </Pressable>

          <Text style={[styles.disclaimer, { color: c.textMuted }]}>
            For informational purposes only. Not a substitute for medical advice.
          </Text>

          <View style={[styles.citationsCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Text style={[styles.citationsTitle, { color: c.textMuted }]}>Data Sources</Text>
            <Pressable
              style={styles.citationRow}
              onPress={() => Linking.openURL("https://diabetesjournals.org/care/issue/47/Supplement_1")}
            >
              <Ionicons name="link-outline" size={12} color={Colors.brand.primary} />
              <Text style={[styles.citationLink, { color: Colors.brand.primary }]}>
                ADA Standards of Care — Carbohydrate recommendations (45–60g/meal)
              </Text>
            </Pressable>
            <Pressable
              style={styles.citationRow}
              onPress={() => Linking.openURL("https://www.health.harvard.edu/diseases-and-conditions/glycemic-index-and-glycemic-load-for-100-foods")}
            >
              <Ionicons name="link-outline" size={12} color={Colors.brand.primary} />
              <Text style={[styles.citationLink, { color: Colors.brand.primary }]}>
                Harvard Health — Glycemic Index and Load Reference
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 14 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.65)", marginTop: 1 },
  shareHeaderBtn: {
    width: 36, height: 36, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center", justifyContent: "center",
  },
  periodRow: { flexDirection: "row", gap: 8 },
  periodBtn: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 20, backgroundColor: "rgba(255,255,255,0.12)",
  },
  periodBtnActive: { backgroundColor: "rgba(255,255,255,0.28)" },
  periodBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "rgba(255,255,255,0.65)" },
  periodBtnTextActive: { color: "#fff", fontFamily: "Inter_700Bold" },
  scroll: { paddingHorizontal: 16, paddingTop: 16, gap: 12, maxWidth: 700, alignSelf: "center" as const, width: "100%" },
  statsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 0 },
  statTile: {
    flex: 1, minWidth: "44%", borderRadius: 14, borderWidth: 1,
    padding: 14, alignItems: "center",
  },
  statTileValue: { fontFamily: "Inter_700Bold", fontSize: 28 },
  statTileLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  section: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 0 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 12 },
  distributionBar: { height: 14, borderRadius: 7, flexDirection: "row", overflow: "hidden", marginBottom: 10 },
  barSegment: { height: "100%" },
  legendRow: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  restaurantRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  rankBadge: {
    width: 26, height: 26, borderRadius: 13,
    alignItems: "center", justifyContent: "center",
  },
  rankText: { fontFamily: "Inter_700Bold", fontSize: 12 },
  restaurantName: { flex: 1, fontFamily: "Inter_500Medium", fontSize: 14 },
  visitBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, backgroundColor: "rgba(0,0,0,0.05)" },
  visitCount: { fontFamily: "Inter_400Regular", fontSize: 12 },
  patternRow: { flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 6 },
  patternDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Colors.brand.primary, marginTop: 6, flexShrink: 0 },
  patternText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  outcomesGrid: { flexDirection: "row", gap: 8, marginBottom: 10 },
  outcomeTile: { flex: 1, borderRadius: 12, padding: 10, alignItems: "center", gap: 4 },
  outcomeCount: { fontFamily: "Inter_700Bold", fontSize: 22 },
  outcomeLabel: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },
  outcomeNote: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center" },
  shareBtn: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14,
    marginTop: 4,
  },
  shareBtnTitle: { fontFamily: "Inter_700Bold", fontSize: 15, color: "#fff" },
  shareBtnSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.75)", marginTop: 2 },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, textAlign: "center", paddingHorizontal: 16, lineHeight: 16 },
  citationsCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8, marginTop: 4 },
  citationsTitle: { fontFamily: "Inter_600SemiBold", fontSize: 10, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 2 },
  citationRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6 },
  citationLink: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, flex: 1, textDecorationLine: "underline" as const },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 10 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  emptySubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  emptyBtn: {
    flexDirection: "row" as const, alignItems: "center" as const, gap: 6,
    paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20, marginTop: 4,
  },
  emptyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
});
