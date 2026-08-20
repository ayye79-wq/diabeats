import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import { ScoreTag } from "@/components/ScoreTag";
import { apiRequest } from "@/lib/query-client";
import { aiMenuResultSchema } from "@/shared/ai-safety";

type AiMenuItem = {
  name: string;
  category: string;
  rating: "good" | "caution" | "avoid";
  reason: string;
  carbs: number;
  calories: number;
  protein: number;
  tip: string;
};

const SCORE_ORDER: Record<string, number> = { good: 0, caution: 1, avoid: 2 };

export default function AiMenuScreen() {
  const { name } = useLocalSearchParams<{ name: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const restaurantName = decodeURIComponent(name || "");

  const [categoryFilter, setCategoryFilter] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data, isLoading, error, refetch } = useQuery<ReturnType<typeof aiMenuResultSchema.parse>>({
    queryKey: ["/api/ai-menu", restaurantName],
    queryFn: async () => {
      const raw = await apiRequest("POST", "/api/ai-menu", { restaurantName }).then((r) => r.json());
      return aiMenuResultSchema.parse(raw);
    },
    enabled: !!restaurantName,
    staleTime: 1000 * 60 * 10,
  });

  const items = data?.items ?? [];
  const categories = [
    "All",
    ...Array.from(new Set(items.map((i) => i.category))),
  ];

  const filtered = items
    .filter((i) => {
      const matchesCat =
        categoryFilter === "All" || i.category === categoryFilter;
      const matchesSearch =
        !searchQuery ||
        i.name.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCat && matchesSearch;
    })
    .sort((a, b) => SCORE_ORDER[a.rating] - SCORE_ORDER[b.rating]);

  const goodCount = items.filter((i) => i.rating === "good").length;
  const cautionCount = items.filter((i) => i.rating === "caution").length;
  const avoidCount = items.filter((i) => i.rating === "avoid").length;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: topPad + 12,
            backgroundColor: c.background,
            borderBottomColor: c.border,
          },
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          style={styles.backBtn}
          hitSlop={12}
        >
          <Ionicons name="arrow-back" size={24} color={c.textPrimary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={[styles.headerTitle, { color: c.textPrimary }]}
            numberOfLines={1}
          >
            {restaurantName}
          </Text>
          <Text style={[styles.headerSub, { color: c.textSecondary }]}>
            AI illustrative menu guide
          </Text>
        </View>
        <View
          style={[
            styles.aiBadge,
            { backgroundColor: Colors.brand.primary + "18" },
          ]}
        >
          <Ionicons name="sparkles" size={12} color={Colors.brand.primary} />
          <Text style={[styles.aiBadgeText, { color: Colors.brand.primary }]}>
            AI
          </Text>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={[styles.loadingTitle, { color: c.textPrimary }]}>
            Analyzing {restaurantName}’s menu...
          </Text>
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>
            Creating an educational, non-verified comparison
          </Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Ionicons
            name="alert-circle-outline"
            size={48}
            color={Colors.brand.avoid}
          />
          <Text style={[styles.errorTitle, { color: c.textPrimary }]}>
            Couldn’t load menu
          </Text>
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>
            Check your connection and try again
          </Text>
          <Pressable
            onPress={() => refetch()}
            style={[styles.retryBtn, { backgroundColor: Colors.brand.primary }]}
          >
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View
            style={[
              styles.disclaimer,
              {
                backgroundColor: Colors.brand.cautionLight,
                borderColor: Colors.brand.caution,
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={15}
              color={Colors.brand.cautionText}
            />
            <Text
              style={[
                styles.disclaimerText,
                { color: Colors.brand.cautionText },
              ]}
            >
              Illustrative AI guide—not a current menu or official nutrition source. Verify with the restaurant.
            </Text>
          </View>
          <View style={[styles.evidenceCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Ionicons name="document-text-outline" size={15} color={c.textMuted} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.evidenceTitle, { color: c.textSecondary }]}>What this guide used</Text>
              <Text style={[styles.evidenceText, { color: c.textMuted }]}>{data?.informationUsed.join(" · ")}</Text>
              <Text style={[styles.evidenceText, { color: c.textMuted }]}>{data?.limitations}</Text>
              <Text style={[styles.evidenceText, { color: c.textMuted }]}>{data?.verification}</Text>
            </View>
          </View>

          {items.length > 0 && (
            <View style={styles.scoreRow}>
              <ScorePill
                count={goodCount}
                label="Better Choice"
                bg={Colors.brand.goodLight}
                color={Colors.brand.goodText}
                icon="checkmark-circle"
              />
              <ScorePill
                count={cautionCount}
                label="Use Caution"
                bg={Colors.brand.cautionLight}
                color={Colors.brand.cautionText}
                icon="warning"
              />
              <ScorePill
                count={avoidCount}
                label="Limit"
                bg={Colors.brand.avoidLight}
                color={Colors.brand.avoidText}
                icon="close-circle"
              />
            </View>
          )}

          <View style={[styles.searchWrap]}>
            <View
              style={[
                styles.searchBar,
                { backgroundColor: c.cardBg, borderColor: c.border },
              ]}
            >
              <Ionicons
                name="search-outline"
                size={16}
                color={c.textMuted}
              />
              <TextInput
                style={[styles.searchInput, { color: c.textPrimary }]}
                accessibilityLabel="Search AI-generated menu items"
                placeholder="Search menu items..."
                placeholderTextColor={c.textMuted}
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCorrect={false}
              />
              {searchQuery !== "" && (
                <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
                  <Ionicons
                    name="close-circle"
                    size={16}
                    color={c.textMuted}
                  />
                </Pressable>
              )}
            </View>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            contentContainerStyle={styles.chipRow}
          >
            {categories.map((cat) => (
              <Pressable
                key={cat}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setCategoryFilter(cat);
                }}
                style={[
                  styles.chip,
                  {
                    backgroundColor:
                      categoryFilter === cat
                        ? Colors.brand.primary
                        : c.cardBg,
                    borderColor:
                      categoryFilter === cat
                        ? Colors.brand.primary
                        : c.border,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.chipText,
                    {
                      color:
                        categoryFilter === cat ? "#fff" : c.textSecondary,
                    },
                  ]}
                >
                  {cat}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={[styles.count, { color: c.textMuted }]}>
            {filtered.length} item{filtered.length !== 1 ? "s" : ""}
            {categoryFilter !== "All" ? ` in ${categoryFilter}` : ""}
          </Text>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingBottom: bottomPad + 24,
            }}
            showsVerticalScrollIndicator={false}
          >
            {filtered.length === 0 ? (
              <View style={[styles.centered, { paddingTop: 40 }]}>
                <Ionicons
                  name="search-outline"
                  size={40}
                  color={c.textMuted}
                />
                <Text style={[styles.errorTitle, { color: c.textSecondary }]}>
                  No items match
                </Text>
              </View>
            ) : (
              filtered.map((item, idx) => (
                <AiMenuItemCard
                  key={`${item.name}-${idx}`}
                  item={item}
                  c={c}
                />
              ))
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function ScorePill({
  count,
  label,
  bg,
  color,
  icon,
}: {
  count: number;
  label: string;
  bg: string;
  color: string;
  icon: string;
}) {
  return (
    <View style={[styles.scorePill, { backgroundColor: bg }]}>
      <Ionicons name={icon as any} size={13} color={color} />
      <Text style={[styles.scorePillCount, { color }]}>{count}</Text>
      <Text style={[styles.scorePillLabel, { color }]}>{label}</Text>
    </View>
  );
}

function AiMenuItemCard({ item, c }: { item: AiMenuItem; c: any }) {
  const ratingColor = {
    good: Colors.brand.goodText,
    caution: Colors.brand.cautionText,
    avoid: Colors.brand.avoidText,
  }[item.rating];

  const ratingBg = {
    good: Colors.brand.goodLight,
    caution: Colors.brand.cautionLight,
    avoid: Colors.brand.avoidLight,
  }[item.rating];

  const ratingBorder = {
    good: Colors.brand.good,
    caution: Colors.brand.caution,
    avoid: Colors.brand.avoid,
  }[item.rating];

  return (
    <View
      style={[
        styles.card,
        { backgroundColor: c.cardBg, borderColor: c.border },
      ]}
    >
      <View style={styles.cardTop}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemName, { color: c.textPrimary }]}>
            {item.name}
          </Text>
          <Text style={[styles.itemCategory, { color: c.textMuted }]}>
            {item.category}
          </Text>
        </View>
        <ScoreTag score={item.rating} size="sm" />
      </View>

      <View style={styles.nutrRow}>
        <NutrBadge
          label="Carbs"
          value={`${item.carbs}g`}
          color={c.textSecondary}
          bg={c.background}
        />
        <NutrBadge
          label="Cal"
          value={`${item.calories}`}
          color={c.textSecondary}
          bg={c.background}
        />
        <NutrBadge
          label="Protein"
          value={`${item.protein}g`}
          color={c.textSecondary}
          bg={c.background}
        />
      </View>

      <View
        style={[
          styles.reasonRow,
          { backgroundColor: ratingBg, borderColor: ratingBorder },
        ]}
      >
        <Text style={[styles.reasonText, { color: ratingColor }]}>
          {item.reason}
        </Text>
      </View>

      {!!item.tip && (
        <View style={styles.tipRow}>
          <Ionicons
            name="bulb-outline"
            size={13}
            color={Colors.brand.primary}
            style={{ marginTop: 1 }}
          />
          <Text style={[styles.tipText, { color: Colors.brand.goodText }]}>
            {item.tip}
          </Text>
        </View>
      )}
    </View>
  );
}

function NutrBadge({
  label,
  value,
  color,
  bg,
}: {
  label: string;
  value: string;
  color: string;
  bg: string;
}) {
  return (
    <View style={[styles.nutrBadge, { backgroundColor: bg }]}>
      <Text style={[styles.nutrValue, { color }]}>{value}</Text>
      <Text style={[styles.nutrLabel, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  aiBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  aiBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
    gap: 12,
  },
  loadingTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 17,
    textAlign: "center",
    marginTop: 8,
  },
  loadingText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    textAlign: "center",
  },
  errorTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17 },
  retryBtn: { paddingHorizontal: 20, paddingVertical: 10, borderRadius: 20 },
  retryText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  disclaimer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  disclaimerText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    flex: 1,
  },
  evidenceCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginHorizontal: 16, marginTop: 8, padding: 10, borderRadius: 10, borderWidth: 1 },
  evidenceTitle: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginBottom: 3 },
  evidenceText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  scoreRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  scorePill: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  scorePillCount: { fontFamily: "Inter_700Bold", fontSize: 13 },
  scorePillLabel: { fontFamily: "Inter_400Regular", fontSize: 11, flex: 1 },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 10 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 14,
  },
  chipRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  chipText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  count: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
    gap: 10,
  },
  cardTop: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
  },
  itemName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    flexShrink: 1,
  },
  itemCategory: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    marginTop: 2,
  },
  nutrRow: { flexDirection: "row", gap: 8 },
  nutrBadge: {
    flex: 1,
    alignItems: "center",
    padding: 8,
    borderRadius: 8,
  },
  nutrValue: { fontFamily: "Inter_700Bold", fontSize: 14 },
  nutrLabel: {
    fontFamily: "Inter_400Regular",
    fontSize: 10,
    marginTop: 1,
  },
  reasonRow: { padding: 8, borderRadius: 8, borderWidth: 1 },
  reasonText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  tipRow: { flexDirection: "row", gap: 6, alignItems: "flex-start" },
  tipText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    flex: 1,
  },
});
