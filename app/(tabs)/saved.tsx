import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import type { Restaurant } from "@/data/restaurants";
import { RestaurantCard } from "@/components/RestaurantCard";
import { ScoreTag } from "@/components/ScoreTag";
import { useApp } from "@/context/AppContext";
import type { BloodSugarOutcome } from "@/context/AppContext";
import { apiRequest } from "@/lib/query-client";
import {
  clearLocalBioTraceScans,
  getPendingLocalBioTraceScans,
  removeLocalBioTraceScan,
  syncPendingBioTraceScans,
  type LocalBioTraceScan,
} from "@/lib/biotrace-history";

const OUTCOME_CONFIG: Record<BloodSugarOutcome, { label: string; color: string; bg: string; icon: string }> = {
  good: { label: "Stable", color: "#166534", bg: "#dcfce7", icon: "checkmark-circle" },
  slight_spike: { label: "Slight spike", color: "#92400e", bg: "#fef3c7", icon: "warning" },
  high_spike: { label: "High spike", color: "#991b1b", bg: "#fee2e2", icon: "alert-circle" },
  not_measured: { label: "Not measured", color: "#4b5563", bg: "#f3f4f6", icon: "remove-circle-outline" },
};

type Tab = "restaurants" | "meals" | "foods" | "scans" | "logs";

type SavedBioTraceFood = {
  id: number;
  productName: string;
  brand: string | null;
  ratingLabel: string;
  note: string | null;
  createdAt: string | null;
};

type BioTraceScan = {
  id: number;
  productName: string;
  brand: string | null;
  ratingLabel: string;
  scannedAt: string | null;
  source: string;
};
type DisplayBioTraceScan = BioTraceScan | LocalBioTraceScan;

export default function SavedScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const [tab, setTab] = useState<Tab>("restaurants");
  const [pendingLocalScans, setPendingLocalScans] = useState<LocalBioTraceScan[]>([]);
  const { 
    savedRestaurants, 
    savedMeals, 
    isRestaurantSaved, 
    toggleSaveRestaurant, 
    toggleSaveMeal,
    mealLog,
    removeMealLog
  } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const { data: allRestaurants = [] } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
  });
  const { data: savedBioTraceFoods = [], refetch: refetchSavedBioTraceFoods } = useQuery<SavedBioTraceFood[]>({
    queryKey: ["/api/biotrace/saved"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/biotrace/saved");
      return response.json();
    },
  });
  const { data: bioTraceScans = [], refetch: refetchBioTraceScans } = useQuery<BioTraceScan[]>({
    queryKey: ["/api/biotrace/scans"],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/biotrace/scans");
      return response.json();
    },
  });
  const refreshLocalScans = useCallback(async () => {
    await syncPendingBioTraceScans();
    setPendingLocalScans(await getPendingLocalBioTraceScans());
  }, []);
  useEffect(() => {
    void refreshLocalScans();
  }, [refreshLocalScans]);
  const visibleBioTraceScans = useMemo<DisplayBioTraceScan[]>(
    () => [...pendingLocalScans, ...bioTraceScans],
    [bioTraceScans, pendingLocalScans],
  );

  const savedRestaurantList = useMemo(() => 
    allRestaurants.filter((r) => savedRestaurants.includes(r.id)),
    [allRestaurants, savedRestaurants]
  );

  const savedMealList = useMemo(() => 
    allRestaurants.flatMap((r) =>
      r.menuItems
        .filter((m) => savedMeals.includes(m.id))
        .map((m) => ({ meal: m, restaurant: r }))
    ),
    [allRestaurants, savedMeals]
  );

  const sortedMealLogs = useMemo(() => 
    [...mealLog].sort((a, b) => new Date(b.loggedAt).getTime() - new Date(a.loggedAt).getTime()),
    [mealLog]
  );

  const handleDeleteLog = (id: string) => {
    if (Platform.OS === "web") {
      if (confirm("Remove this meal log?")) {
        removeMealLog(id);
      }
      return;
    }

    Alert.alert(
      "Remove Log",
      "Are you sure you want to remove this meal log?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Remove", style: "destructive", onPress: () => removeMealLog(id) }
      ]
    );
  };

  const handleDeleteSavedFood = (food: SavedBioTraceFood) => {
    const remove = async () => {
      try {
        await apiRequest("DELETE", `/api/biotrace/saved/${food.id}`);
        await refetchSavedBioTraceFoods();
      } catch {
        Alert.alert("Couldn’t remove food", "Please try again.");
      }
    };
    if (Platform.OS === "web") {
      if (confirm(`Remove ${food.productName} from saved foods?`)) void remove();
      return;
    }
    Alert.alert("Remove saved food", `Remove ${food.productName} from your BioTrace foods?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove() },
    ]);
  };

  const handleDeleteBioTraceScan = (scan: DisplayBioTraceScan) => {
    const remove = async () => {
      if ("localId" in scan) {
        await removeLocalBioTraceScan(scan.localId);
        await refreshLocalScans();
        return;
      }
      try {
        await apiRequest("DELETE", `/api/biotrace/scans/${scan.id}`);
        await refetchBioTraceScans();
      } catch {
        Alert.alert("Couldn’t remove scan", "Please try again.");
      }
    };
    if (Platform.OS === "web") {
      if (confirm(`Remove ${scan.productName} from scan history?`)) void remove();
      return;
    }
    Alert.alert("Remove scan", `Remove ${scan.productName} from your BioTrace scan history?`, [
      { text: "Cancel", style: "cancel" },
      { text: "Remove", style: "destructive", onPress: () => void remove() },
    ]);
  };

  const handleClearBioTraceScans = () => {
    const clear = async () => {
      try {
        await Promise.all([
          apiRequest("DELETE", "/api/biotrace/scans"),
          clearLocalBioTraceScans(),
        ]);
        await refetchBioTraceScans();
        await refreshLocalScans();
      } catch {
        Alert.alert("Couldn’t clear history", "Please try again.");
      }
    };
    if (Platform.OS === "web") {
      if (confirm("Clear all BioTrace scan history? This cannot be undone.")) void clear();
      return;
    }
    Alert.alert("Clear scan history", "This permanently removes all of your BioTrace scan records.", [
      { text: "Cancel", style: "cancel" },
      { text: "Clear history", style: "destructive", onPress: () => void clear() },
    ]);
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: c.cardBg, borderBottomColor: c.border },
        ]}
      >
        <Text style={[styles.title, { color: c.textPrimary }]}>Saved</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tabs}
          style={styles.tabScroller}
        >
          {([
            { id: "restaurants" as Tab, label: `Places (${savedRestaurantList.length})` },
            { id: "meals" as Tab, label: `Meals (${savedMealList.length})` },
              { id: "foods" as Tab, label: `Foods (${savedBioTraceFoods.length})` },
              { id: "scans" as Tab, label: `Scans (${visibleBioTraceScans.length})` },
            { id: "logs" as Tab, label: `Logs (${mealLog.length})` },
          ]).map((t) => (
            <Pressable
              key={t.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setTab(t.id);
              }}
              style={[
                styles.tabBtn,
                t.id === tab && { borderBottomColor: Colors.brand.primary, borderBottomWidth: 2 },
              ]}
              accessibilityRole="tab"
              accessibilityLabel={t.label}
              accessibilityState={{ selected: t.id === tab }}
            >
              <Text
                style={[
                  styles.tabText,
                  { color: t.id === tab ? Colors.brand.primary : c.textMuted },
                ]}
              >
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.list}
        contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        {tab === "restaurants" ? (
          savedRestaurantList.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="heart-outline" size={48} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No saved restaurants</Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                Tap the heart on any restaurant to save it here
              </Text>
            </View>
          ) : (
            savedRestaurantList.map((r) => (
              <RestaurantCard
                key={r.id}
                restaurant={r}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/restaurant/${r.id}`);
                }}
                saved={isRestaurantSaved(r.id)}
                onToggleSave={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  toggleSaveRestaurant(r.id);
                }}
              />
            ))
          )
        ) : tab === "meals" ? (
          savedMealList.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="bookmark-outline" size={48} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No saved meals</Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                Save specific meals to review and compare them later
              </Text>
            </View>
          ) : (
            savedMealList.map(({ meal, restaurant }) => (
              <Pressable
                key={meal.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  router.push(`/meal/${restaurant.id}/${meal.id}`);
                }}
                style={({ pressed }) => [
                  styles.mealCard,
                  { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.92 : 1 },
                ]}
              >
                <View style={styles.mealCardHeader}>
                  <View style={styles.mealCardInfo}>
                    <Text style={[styles.mealName, { color: c.textPrimary }]} numberOfLines={1}>
                      {meal.name}
                    </Text>
                    <Text style={[styles.mealRestaurant, { color: c.textSecondary }]}>
      {restaurant.name} · {restaurant.cuisine}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => {
                      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      toggleSaveMeal(meal.id);
                    }}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel={`Remove ${meal.name} from saved meals`}
                  >
                    <Ionicons name="bookmark" size={18} color={Colors.brand.primary} />
                  </Pressable>
                </View>
                <View style={styles.mealCardFooter}>
                  <ScoreTag score={meal.diabeticScore} size="sm" />
                  <Text style={[styles.carbRange, { color: c.textMuted }]}>{meal.carbRange}</Text>
                </View>
              </Pressable>
            ))
          )
        ) : tab === "foods" ? (
          savedBioTraceFoods.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="barcode-outline" size={48} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No saved foods</Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                Scan a packaged product with BioTrace and save it for later
              </Text>
              <Pressable
                onPress={() => router.push("/(tabs)/biotrace")}
                style={styles.scanFoodButton}
                accessibilityRole="button"
                accessibilityLabel="Scan a packaged food with BioTrace"
              >
                <Text style={styles.scanFoodButtonText}>Scan a food</Text>
              </Pressable>
            </View>
          ) : (
            savedBioTraceFoods.map((food) => {
              const ratingTone =
                food.ratingLabel === "better-fit"
                  ? { bg: "#DCFCE7", color: "#166534", label: "Better Fit" }
                  : food.ratingLabel === "limit"
                    ? { bg: "#FEE2E2", color: "#991B1B", label: "Limit" }
                    : food.ratingLabel === "insufficient-information"
                      ? { bg: "#E5E7EB", color: "#374151", label: "Needs label data" }
                      : { bg: "#FEF3C7", color: "#92400E", label: "Use with Caution" };
              return (
                <Pressable
                  key={food.id}
                  onPress={() => router.push("/(tabs)/biotrace")}
                  style={({ pressed }) => [
                    styles.mealCard,
                    { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.92 : 1 },
                  ]}
                >
                  <View style={styles.mealCardHeader}>
                    <View style={styles.mealCardInfo}>
                      <Text style={[styles.mealName, { color: c.textPrimary }]} numberOfLines={1}>
                        {food.productName}
                      </Text>
                      <Text style={[styles.mealRestaurant, { color: c.textSecondary }]} numberOfLines={1}>
                        {food.brand ?? "Brand not listed"} · BioTrace
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        handleDeleteSavedFood(food);
                      }}
                      hitSlop={12}
                      accessibilityLabel={`Remove ${food.productName} from saved foods`}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.brand.avoid} />
                    </Pressable>
                  </View>
                  {food.note ? (
                    <Text style={[styles.foodNote, { color: c.textSecondary }]} numberOfLines={2}>{food.note}</Text>
                  ) : null}
                  <View style={styles.mealCardFooter}>
                    <View style={[styles.foodRating, { backgroundColor: ratingTone.bg }]}>
                      <Text style={[styles.foodRatingText, { color: ratingTone.color }]}>{ratingTone.label}</Text>
                    </View>
                    <Text style={[styles.carbRange, { color: c.textMuted }]}>
                      {food.createdAt ? new Date(food.createdAt).toLocaleDateString() : "Saved food"}
                    </Text>
                  </View>
                </Pressable>
              );
            })
          )
        ) : tab === "scans" ? (
          visibleBioTraceScans.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="time-outline" size={48} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No BioTrace scans</Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                Your packaged-food lookups will appear here. You control and can delete this history.
              </Text>
            </View>
          ) : (
            <>
              <Pressable onPress={handleClearBioTraceScans} style={styles.clearHistoryButton} accessibilityRole="button" accessibilityLabel="Clear all BioTrace scan history">
                <Ionicons name="trash-outline" size={15} color={Colors.brand.avoid} />
                <Text style={styles.clearHistoryText}>Clear all scan history</Text>
              </Pressable>
              {visibleBioTraceScans.map((scan) => (
                <View key={"localId" in scan ? scan.localId : scan.id} style={[styles.mealCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                  <View style={styles.mealCardHeader}>
                    <View style={styles.mealCardInfo}>
                      <Text style={[styles.mealName, { color: c.textPrimary }]} numberOfLines={1}>
                        {scan.productName}
                      </Text>
                      <Text style={[styles.mealRestaurant, { color: c.textSecondary }]} numberOfLines={1}>
                        {scan.brand ?? "Brand not listed"} · {scan.source === "search" ? "Product search" : "Barcode scan"}{"localId" in scan ? " · Waiting to sync" : ""}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => handleDeleteBioTraceScan(scan)}
                      hitSlop={12}
                      accessibilityLabel={`Remove ${scan.productName} from scan history`}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.brand.avoid} />
                    </Pressable>
                  </View>
                  <View style={styles.mealCardFooter}>
                    <View style={[styles.foodRating, { backgroundColor: "#E8F7ED" }]}>
                      <Text style={[styles.foodRatingText, { color: Colors.brand.primary }]}>
                        {scan.ratingLabel.replace(/-/g, " ")}
                      </Text>
                    </View>
                    <Text style={[styles.carbRange, { color: c.textMuted }]}>
                        {scan.scannedAt ? new Date(scan.scannedAt).toLocaleString() : "Recent scan"}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )
        ) : (
          sortedMealLogs.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="calendar-outline" size={48} color={c.textMuted} />
              <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No meal logs</Text>
              <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                Tap “Log this meal” on any meal to track what you eat
              </Text>
            </View>
          ) : (
            sortedMealLogs.map((entry) => {
              const outcomeConf = entry.outcome ? OUTCOME_CONFIG[entry.outcome] : null;
              return (
                <View
                  key={entry.id}
                  style={[styles.mealCard, { backgroundColor: c.cardBg, borderColor: c.border }]}
                >
                  <View style={styles.mealCardHeader}>
                    <View style={styles.mealCardInfo}>
                      <Text style={[styles.mealName, { color: c.textPrimary }]} numberOfLines={1}>
                        {entry.mealName}
                      </Text>
                      <Text style={[styles.mealRestaurant, { color: c.textSecondary }]}>
                        {entry.restaurantName} · {new Date(entry.loggedAt).toLocaleDateString()} {new Date(entry.loggedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </Text>
                    </View>
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                        handleDeleteLog(entry.id);
                      }}
                      hitSlop={12}
                    >
                      <Ionicons name="trash-outline" size={18} color={Colors.brand.avoid} />
                    </Pressable>
                  </View>

                  {entry.bloodSugarNote && (
                    <View style={[styles.noteContainer, { backgroundColor: c.background }]}>
                      <Ionicons name="document-text-outline" size={14} color={c.textSecondary} />
                      <Text style={[styles.noteText, { color: c.textSecondary }]}>{entry.bloodSugarNote}</Text>
                    </View>
                  )}

                  {outcomeConf ? (
                    <View style={[styles.outcomeBadge, { backgroundColor: outcomeConf.bg }]}>
                      <Ionicons name={outcomeConf.icon as any} size={15} color={outcomeConf.color} />
                      <Text style={[styles.outcomeBadgeText, { color: outcomeConf.color }]}>
                        {outcomeConf.label}
                      </Text>
                      {(entry.glucoseBefore || entry.glucoseAfter) && (
                        <Text style={[styles.glucoseReadingText, { color: outcomeConf.color }]}>
                          {entry.glucoseBefore ? `${entry.glucoseBefore}` : "—"}
                          {" → "}
                          {entry.glucoseAfter ? `${entry.glucoseAfter} mg/dL` : "—"}
                        </Text>
                      )}
                      <Pressable
                        onPress={() => {
                          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                          router.push({ pathname: "/log-outcome" as any, params: { logId: entry.id, mealName: entry.mealName } });
                        }}
                        hitSlop={8}
                        style={styles.editOutcomeBtn}
                      >
                        <Ionicons name="pencil-outline" size={13} color={outcomeConf.color} />
                      </Pressable>
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        router.push({ pathname: "/log-outcome" as any, params: { logId: entry.id, mealName: entry.mealName } });
                      }}
                      style={[styles.outcomePrompt, { backgroundColor: "#fef3c7", borderColor: "#fcd34d" }]}
                      testID={`log-outcome-prompt-${entry.id}`}
                    >
                      <Ionicons name="pulse-outline" size={16} color="#92400e" />
                      <Text style={[styles.outcomePromptText, { color: "#92400e" }]}>
                        How did this affect your blood sugar?
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color="#92400e" />
                    </Pressable>
                  )}

                  <View style={styles.mealCardFooter}>
                    <ScoreTag score={entry.diabeticScore} size="sm" />
                    <Text style={[styles.carbRange, { color: c.textMuted }]}>{entry.carbRange}</Text>
                  </View>
                </View>
              );
            })
          )
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 0,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    marginBottom: 16,
  },
  tabs: {
    flexDirection: "row",
    gap: 20,
    paddingHorizontal: 18,
  },
  tabScroller: { marginHorizontal: -18 },
  tabBtn: {
    paddingBottom: 12,
    paddingTop: 4,
  },
  tabText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
  },
  list: { flex: 1 },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 10,
  },
  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 12,
  },
  emptyTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  emptyText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  mealCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    ...Platform.select({
      web: { boxShadow: "0px 1px 4px rgba(0,0,0,0.05)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
      },
    }),
  },
  mealCardHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  mealCardInfo: {
    flex: 1,
    marginRight: 8,
  },
  mealName: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    marginBottom: 2,
  },
  mealRestaurant: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  mealCardFooter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  scanFoodButton: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 11,
    marginTop: 16,
  },
  scanFoodButtonText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  foodNote: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, marginTop: 10 },
  foodRating: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 },
  foodRatingText: { fontFamily: "Inter_700Bold", fontSize: 11 },
  clearHistoryButton: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 4,
    marginBottom: 4,
  },
  clearHistoryText: { color: Colors.brand.avoid, fontFamily: "Inter_600SemiBold", fontSize: 12 },
  carbRange: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  noteContainer: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },
  noteText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  outcomeBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 10,
  },
  outcomeBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  glucoseReadingText: { fontFamily: "Inter_400Regular", fontSize: 12, flex: 1, textAlign: "right" },
  editOutcomeBtn: { marginLeft: "auto" as any },
  outcomePrompt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  outcomePromptText: {
    flex: 1,
    fontFamily: "Inter_500Medium",
    fontSize: 13,
  },
});
