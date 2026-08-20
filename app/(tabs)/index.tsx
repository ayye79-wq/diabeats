import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  FlatList,
  TextInput,
  Pressable,
  Platform,
  useColorScheme,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import type { Restaurant } from "@/data/restaurants";
import { RestaurantCard } from "@/components/RestaurantCard";
import { ScoreTag } from "@/components/ScoreTag";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/query-client";
import { trackEvent } from "@/lib/trackEvent";
import { getBloodSugarImpact, getWhyText } from "@/lib/mealInsights";

type BrowseFilter = "all" | "good" | "caution" | "low-carb" | "high-protein";
type SortOption = "default" | "rating" | "friendly" | "distance";

function localSearch(query: string, restaurants: Restaurant[]): { results: SmartResult[]; intent: { summary: string; isHealthIntent: boolean } } {
  const q = query.toLowerCase();
  const tokens = q.split(/\s+/).filter((t) => t.length > 2);

  const healthWords = ["low carb", "low-carb", "keto", "diabetes", "diabetic", "friendly", "healthy", "safe", "good", "sugar", "protein", "diet"];
  const avoidWords = ["avoid", "worst", "bad", "high carb", "unhealthy"];
  const isHealthIntent = healthWords.some((w) => q.includes(w));
  const wantGoodOnly = isHealthIntent && !avoidWords.some((w) => q.includes(w));

  const maxCarbs = q.includes("keto") ? 20 : q.includes("very low carb") ? 15 : q.includes("low carb") ? 30 : null;

  const results: SmartResult[] = [];

  for (const r of restaurants) {
    for (const m of r.menuItems) {
      if (wantGoodOnly && m.diabeticScore === "avoid") continue;
      if (maxCarbs !== null) {
        const nums = m.carbRange?.match(/\d+/g);
        if (nums) {
          const max = Math.max(...nums.map(Number));
          if (max > maxCarbs) continue;
        }
      }
      const text = `${m.name} ${m.description} ${m.category} ${r.cuisine} ${r.name}`.toLowerCase();
      let score = tokens.reduce((acc, t) => acc + (text.includes(t) ? 2 : 0), 0);
      if (m.diabeticScore === "good") score += 1;
      if (score === 0 && wantGoodOnly && m.diabeticScore === "good") score = 0.5;
      if (score > 0 || wantGoodOnly) {
        results.push({
          item: {
            id: m.id, name: m.name, description: m.description,
            category: m.category, price: m.price ?? "",
            diabeticScore: m.diabeticScore, carbRange: m.carbRange,
            quickTip: (m as any).quickTip ?? "",
            nutrients: (m.nutrients as any) ?? [],
          },
          restaurant: { id: r.id, name: r.name, cuisine: r.cuisine, distance: r.distance, rating: r.rating },
        });
      }
    }
  }

  results.sort((a, b) => {
    const sa = a.item.diabeticScore === "good" ? 2 : a.item.diabeticScore === "caution" ? 1 : 0;
    const sb = b.item.diabeticScore === "good" ? 2 : b.item.diabeticScore === "caution" ? 1 : 0;
    return sb - sa;
  });

  return {
    results: results.slice(0, 15),
    intent: { summary: query, isHealthIntent },
  };
}

function parseCarbGrams(carbRange: string): number | null {
  const nums = carbRange.match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

function parseProteinGrams(nutrients: { label: string; value: string }[]): number | null {
  const n = nutrients.find((x) => x.label.toLowerCase().includes("protein"));
  if (!n) return null;
  const v = parseFloat(n.value.replace(/[^\d.]/g, ""));
  return isNaN(v) ? null : v;
}

interface SmartResult {
  item: {
    id: string;
    name: string;
    description: string;
    category: string;
    price: string;
    diabeticScore: string;
    carbRange: string;
    quickTip: string;
    nutrients: { label: string; value: string }[];
  };
  restaurant: {
    id: string;
    name: string;
    cuisine: string;
    distance: string;
    rating: number;
  };
}

interface SmartIntent {
  summary: string;
  criteria: string[];
  isHealthIntent: boolean;
  mentionedRestaurant?: string | null;
  restaurantNotFound?: boolean;
}

const SUGGESTIONS = [
  "Low carb dinner",
  "High protein lunch",
  "Diabetes-friendly breakfast",
  "Under 30g carbs",
  "Grilled fish",
  "Vegetarian friendly",
];

export default function DiscoverScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<BrowseFilter>("all");
  const [sortBy, setSortBy] = useState<SortOption>("default");
  const [selectedCuisine, setSelectedCuisine] = useState<string>("All");
  const [locationLabel, setLocationLabel] = useState("Nearby");
  const [locating, setLocating] = useState(false);

  const [smartMode, setSmartMode] = useState(false);
  const [smartLoading, setSmartLoading] = useState(false);
  const [smartResults, setSmartResults] = useState<SmartResult[]>([]);
  const [smartIntent, setSmartIntent] = useState<SmartIntent | null>(null);
  const [smartError, setSmartError] = useState<string | null>(null);
  const [searchFocused, setSearchFocused] = useState(false);

  const inputRef = useRef<TextInput>(null);

  const [showProfileNudge, setShowProfileNudge] = useState(false);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const { isRestaurantSaved, toggleSaveRestaurant, dietGoal, recentlyViewed, diabetesType } = useApp();

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const { data: restaurants = [], isLoading: restaurantsLoading } = useQuery<Restaurant[]>({
    queryKey: ["/api/restaurants"],
  });

  const cuisines = ["All", ...Array.from(new Set(restaurants.map((r) => r.cuisine)))].sort();

  const requestLocation = useCallback(async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        const geocode = await Location.reverseGeocodeAsync({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
        if (geocode[0]) {
          const { city, district } = geocode[0];
          setLocationLabel(district || city || "Your Area");
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
    } catch {
      setLocationLabel("Nearby");
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    requestLocation();
  }, [requestLocation]);

  const runSmartSearch = useCallback(async (query: string) => {
    const q = query.trim();
    if (!q) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    inputRef.current?.blur();
    setSmartLoading(true);
    setSmartMode(true);
    setSmartError(null);
    setSmartResults([]);
    setSmartIntent(null);
    trackEvent("search_query", { metadata: { query: q } });

    const attempt = async () => {
      const res = await apiRequest("POST", "/api/search", { query: q });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      return data;
    };

    try {
      let data: any;
      try {
        data = await attempt();
      } catch (firstErr) {
        console.warn("[DiabEats] Search attempt 1 failed:", firstErr);
        try {
          await new Promise((r) => setTimeout(r, 800));
          data = await attempt();
        } catch (retryErr) {
          console.warn("[DiabEats] Search retry failed, using local fallback:", retryErr);
          data = localSearch(q, restaurants);
        }
      }
      setSmartIntent(data.intent);
      setSmartResults(data.results ?? []);
      if (diabetesType === null && !nudgeDismissed && (data.results?.length ?? 0) > 0) {
        setShowProfileNudge(true);
      }
    } catch (err) {
      console.warn("[DiabEats] Search failed entirely:", err);
      setSmartError("Search failed. Please try again.");
    } finally {
      setSmartLoading(false);
    }
  }, [diabetesType, nudgeDismissed, restaurants]);

  const clearSmartSearch = () => {
    setSmartMode(false);
    setSmartResults([]);
    setSmartIntent(null);
    setSmartError(null);
    setSearch("");
  };

  const handleSearch = useCallback((query: string) => {
    const q = query.trim();
    if (!q) return;
    const lowerQ = q.toLowerCase();
    const isNameMatch = restaurants.some(
      (r) =>
        r.name.toLowerCase().includes(lowerQ) ||
        lowerQ.includes(r.name.toLowerCase()) ||
        r.cuisine.toLowerCase().includes(lowerQ)
    );
    if (isNameMatch) {
      if (smartMode) {
        setSmartMode(false);
        setSmartResults([]);
        setSmartIntent(null);
        setSmartError(null);
      }
      inputRef.current?.blur();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } else {
      runSmartSearch(q);
    }
  }, [restaurants, smartMode, runSmartSearch]);

  const handleSuggestion = (s: string) => {
    setSearch(s);
    runSmartSearch(s);
  };

  const filtered = restaurants
    .filter((r) => {
      const lowerSearch = search.toLowerCase();
      const matchesSearch =
        search.trim() === "" ||
        r.name.toLowerCase().includes(lowerSearch) ||
        lowerSearch.includes(r.name.toLowerCase()) ||
        r.cuisine.toLowerCase().includes(lowerSearch) ||
        r.tags.some((t) => t.toLowerCase().includes(lowerSearch));

      const matchesCuisine = selectedCuisine === "All" || r.cuisine === selectedCuisine;

      let matchesFilter = true;
      if (filter === "good") {
        matchesFilter = r.menuItems.some((m) => m.diabeticScore === "good");
      } else if (filter === "caution") {
        matchesFilter = !r.menuItems.every((m) => m.diabeticScore === "avoid");
      } else if (filter === "low-carb") {
        matchesFilter = r.menuItems.some((m) => {
          const carbs = parseCarbGrams(m.carbRange);
          return carbs !== null && carbs <= 20;
        });
      } else if (filter === "high-protein") {
        matchesFilter = r.menuItems.some((m) => {
          const protein = parseProteinGrams(m.nutrients as { label: string; value: string }[]);
          return protein !== null && protein >= 25;
        });
      }

      return matchesSearch && matchesCuisine && matchesFilter;
    })
    .sort((a, b) => {
      if (sortBy === "rating") {
        return b.rating - a.rating;
      }
      if (sortBy === "friendly") {
        const getFriendlyPercent = (r: Restaurant) => {
          const goodCount = r.menuItems.filter((m) => m.diabeticScore === "good").length;
          return (goodCount / r.menuItems.length) * 100;
        };
        return getFriendlyPercent(b) - getFriendlyPercent(a);
      }
      if (sortBy === "distance") {
        const distA = parseFloat(a.distance) || 0;
        const distB = parseFloat(b.distance) || 0;
        return distA - distB;
      }
      return 0;
    });


  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={["#0E2016", "#166534"]}
        style={[styles.header, { paddingTop: topPad + 16 }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerLabel}>Eating near</Text>
            <Pressable onPress={requestLocation} style={styles.locationRow}>
              {locating ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <>
                  <Ionicons name="location" size={16} color={Colors.brand.primaryLight} />
                  <Text style={styles.locationText}>{locationLabel}</Text>
                  <Ionicons name="chevron-down" size={14} color="rgba(255,255,255,0.6)" />
                </>
              )}
            </Pressable>
          </View>
          <View style={styles.logoWrap}>
            <Ionicons name="leaf" size={22} color={Colors.brand.primaryLight} />
          </View>
        </View>

        <View style={[styles.searchRow, smartMode && styles.searchRowActive]}>
          <Ionicons
            name={smartMode ? "sparkles" : "search"}
            size={18}
            color={smartMode ? Colors.brand.primaryLight : "rgba(255,255,255,0.5)"}
            style={styles.searchIcon}
          />
          <TextInput
            ref={inputRef}
            style={styles.searchInput}
            placeholder={searchFocused ? "" : 'Try "Low carb dinner near me"'}
            placeholderTextColor="rgba(255,255,255,0.4)"
            value={search}
            onChangeText={(t) => {
              setSearch(t);
              if (smartMode && t.trim() === "") clearSmartSearch();
            }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            onSubmitEditing={() => handleSearch(search)}
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={clearSmartSearch}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
            >
              <Ionicons name="close-circle" size={18} color="rgba(255,255,255,0.5)" />
            </Pressable>
          ) : null}
        </View>

        {!smartMode && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              router.push("/safe-nearby");
            }}
            style={({ pressed }) => [styles.safeBtn, { opacity: pressed ? 0.88 : 1 }]}
            testID="find-safe-meal-btn"
          >
            <View style={styles.safeBtnInner}>
              <View style={styles.safeBtnIconWrap}>
                <Ionicons name="leaf" size={16} color={Colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.safeBtnTitle}>Find Safe Meal Near Me</Text>
                <Text style={styles.safeBtnSub}>Low blood sugar impact · Curated safe meals</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={22} color={Colors.brand.primaryLight} />
            </View>
          </Pressable>
        )}

        {!smartMode && (
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              router.push("/(tabs)/biotrace");
            }}
            style={({ pressed }) => [styles.safeBtn, { marginTop: 9, opacity: pressed ? 0.88 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Scan a packaged food product"
          >
            <View style={styles.safeBtnInner}>
              <View style={styles.safeBtnIconWrap}>
                <Ionicons name="barcode-outline" size={16} color={Colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.safeBtnTitle}>Scan a Product</Text>
                <Text style={styles.safeBtnSub}>Barcode insights · Ingredients · Better alternatives</Text>
              </View>
              <Ionicons name="arrow-forward-circle" size={22} color={Colors.brand.primaryLight} />
            </View>
          </Pressable>
        )}

        {!smartMode && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.suggestions}
          >
            {SUGGESTIONS.map((s) => (
              <Pressable
                key={s}
                onPress={() => handleSuggestion(s)}
                style={styles.suggestionChip}
              >
                <Ionicons name="sparkles-outline" size={11} color={Colors.brand.primaryLight} />
                <Text style={styles.suggestionText}>{s}</Text>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </LinearGradient>

      {smartMode ? (
        <View style={{ flex: 1 }}>
          {showProfileNudge && (
            <View style={[styles.nudgeContainer, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good }]}>
              <View style={styles.nudgeIconWrap}>
                <Ionicons name="person-circle-outline" size={24} color={Colors.brand.good} />
              </View>
              <View style={styles.nudgeContent}>
                <Text style={[styles.nudgeTitle, { color: Colors.brand.primaryDark }]}>Personalize your results</Text>
                <Text style={[styles.nudgeSub, { color: Colors.brand.primary }]}>
                  Add your diabetes type for better meal recommendations.
                </Text>
                <Pressable 
                  onPress={() => router.push("/(tabs)/profile")}
                  style={styles.nudgeAction}
                >
                  <Text style={styles.nudgeActionText}>Set Up Profile</Text>
                </Pressable>
              </View>
              <Pressable 
                onPress={() => {
                  setShowProfileNudge(false);
                  setNudgeDismissed(true);
                }} 
                style={styles.nudgeClose}
              >
                <Ionicons name="close" size={20} color={Colors.brand.primary} />
              </Pressable>
            </View>
          )}
          <SmartSearchResults
            loading={smartLoading}
            intent={smartIntent}
            results={smartResults}
            error={smartError}
            onClear={clearSmartSearch}
            onItemPress={(r) => router.push(`/meal/${r.restaurant.id}/${r.item.id}`)}
            onRequestRestaurant={() => router.push("/(tabs)/profile")}
            bottomPad={bottomPad}
            c={c}
            dietGoal={dietGoal}
          />
        </View>
      ) : (
        <>
          <View style={[styles.filterBar, { backgroundColor: c.background }]}>
            <View style={styles.filterRowContainer}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterScroll}
              >
                {(["all", "good", "caution", "low-carb", "high-protein"] as BrowseFilter[]).map((f) => {
                  const label = f === "all" ? "All" : f === "good" ? "Friendly" : f === "caution" ? "Moderate" : f === "low-carb" ? "Low Carb" : "High Protein";
                  const activeBg = f === "all" ? Colors.brand.primary : f === "good" ? Colors.brand.good : f === "caution" ? Colors.brand.caution : f === "low-carb" ? "#0284c7" : "#7c3aed";
                  return (
                    <Pressable
                      key={f}
                      onPress={() => {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                        setFilter(f);
                      }}
                      style={[
                        styles.filterBtn,
                        filter === f ? { backgroundColor: activeBg } : { borderColor: c.border, borderWidth: 1 },
                      ]}
                    >
                      <Text style={[styles.filterText, { color: filter === f ? "#fff" : c.textSecondary }]}>
                        {label}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={[styles.sortWrapper, { borderLeftColor: c.border }]}>
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    const options: SortOption[] = ["default", "rating", "friendly", "distance"];
                    const nextIndex = (options.indexOf(sortBy) + 1) % options.length;
                    setSortBy(options[nextIndex]);
                  }}
                  style={[
                    styles.sortBtn,
                    sortBy !== "default" && { backgroundColor: Colors.brand.primary },
                  ]}
                >
                  <Ionicons
                    name="swap-vertical"
                    size={16}
                    color={sortBy === "default" ? c.textSecondary : "#fff"}
                  />
                  <Text
                    style={[
                      styles.sortText,
                      { color: sortBy === "default" ? c.textSecondary : "#fff" },
                    ]}
                  >
                    {sortBy === "default"
                      ? "Sort"
                      : sortBy === "rating"
                      ? "Rating"
                      : sortBy === "friendly"
                      ? "Friendly"
                      : "Near"}
                  </Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cuisineScroll}
            >
              {cuisines.map((cuisine) => (
                <Pressable
                  key={cuisine}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setSelectedCuisine(cuisine);
                  }}
                  style={[
                    styles.cuisineBtn,
                    selectedCuisine === cuisine && {
                      backgroundColor: Colors.brand.primary,
                      borderColor: Colors.brand.primary,
                    },
                    selectedCuisine !== cuisine && { borderColor: c.border },
                  ]}
                >
                  <Text
                    style={[
                      styles.cuisineText,
                      selectedCuisine === cuisine ? { color: "#fff" } : { color: c.textSecondary },
                    ]}
                  >
                    {cuisine}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>

          <ScrollView
            style={styles.list}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomPad + 100 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {restaurantsLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator size="large" color={Colors.brand.primary} />
                <Text style={[styles.loadingText, { color: c.textSecondary }]}>
                  Loading restaurants...
                </Text>
              </View>
            ) : (
              <>
                {recentlyViewed.length > 0 && search.trim() === "" && (
                  <View style={styles.recentlyViewedContainer}>
                    <View style={styles.sectionHeader}>
                      <Text style={[styles.sectionTitle, { color: c.textPrimary, marginBottom: 0 }]}>
                        Recently Viewed
                      </Text>
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.recentlyViewedScroll}
                    >
                      {recentlyViewed.map((item, idx) => (
                        <Pressable
                          key={`${item.menuItemId}-${idx}`}
                          style={[styles.recentCard, { backgroundColor: c.cardBg, borderColor: c.border }]}
                          onPress={() => router.push(`/meal/${item.restaurantId}/${item.menuItemId}`)}
                        >
                          <View style={styles.recentCardHeader}>
                            <View 
                              style={[
                                styles.scoreDot, 
                                { 
                                  backgroundColor: 
                                    item.diabeticScore === "good" 
                                      ? Colors.brand.good 
                                      : item.diabeticScore === "caution" 
                                      ? Colors.brand.caution 
                                      : Colors.brand.avoid 
                                }
                              ]} 
                            />
                            <Text style={[styles.recentMealName, { color: c.textPrimary }]} numberOfLines={1}>
                              {item.mealName}
                            </Text>
                          </View>
                          <Text style={[styles.recentRestaurantName, { color: c.textSecondary }]} numberOfLines={1}>
                            {item.restaurantName}
                          </Text>
                        </Pressable>
                      ))}
                    </ScrollView>
                  </View>
                )}

                <Text style={[styles.sectionTitle, { color: c.textSecondary }]}>
                  {filtered.length} {filtered.length === 1 ? "restaurant" : "restaurants"} found
                </Text>
                {filtered.length === 0 ? (
                  <View style={styles.centered}>
                    <Ionicons name="restaurant-outline" size={48} color={c.textMuted} />
                    <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>
                      {search.trim() ? `"${search.trim()}" not found` : "No results"}
                    </Text>
                    <Text style={[styles.emptyText, { color: c.textSecondary }]}>
                      {search.trim()
                        ? "This restaurant isn’t in our directory yet"
                        : "Try a different search or filter"}
                    </Text>
                    {search.trim() ? (
                      <View style={styles.emptyActions}>
                        <Pressable
                          style={[styles.aiMenuBtnLg, { backgroundColor: Colors.brand.primary }]}
                          onPress={() => {
                            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                            router.push(`/ai-menu/${encodeURIComponent(search.trim())}`);
                          }}
                        >
                          <Ionicons name="sparkles" size={15} color="#fff" />
                          <Text style={styles.aiMenuBtnLgText}>View AI Menu for {search.trim()}</Text>
                        </Pressable>
                        <Pressable
                          style={[styles.similarBtn, { backgroundColor: c.cardBg, borderColor: c.border, borderWidth: 1 }]}
                          onPress={() => runSmartSearch(search.trim())}
                        >
                          <Ionicons name="search" size={15} color={c.textSecondary} />
                          <Text style={[styles.similarBtnText, { color: c.textSecondary }]}>Find similar dishes</Text>
                        </Pressable>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  filtered.map((r) => (
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
                )}
              </>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

function SmartSearchResults({
  loading,
  intent,
  results,
  error,
  onClear,
  onItemPress,
  onRequestRestaurant,
  bottomPad,
  c,
  dietGoal,
}: {
  loading: boolean;
  intent: SmartIntent | null;
  results: SmartResult[];
  error: string | null;
  onClear: () => void;
  onItemPress: (r: SmartResult) => void;
  onRequestRestaurant: () => void;
  bottomPad: number;
  c: any;
  dietGoal: import("@/context/AppContext").DietGoal;
}) {
  return (
    <View style={{ flex: 1 }}>
      {intent?.restaurantNotFound && intent.mentionedRestaurant && (
        <View style={[styles.notFoundBanner, { backgroundColor: Colors.brand.cautionLight, borderColor: Colors.brand.caution }]}>
          <Ionicons name="storefront-outline" size={18} color={Colors.brand.cautionText} style={{ flexShrink: 0 }} />
          <View style={{ flex: 1 }}>
            <Text style={[styles.notFoundTitle, { color: Colors.brand.cautionText }]}>
              {intent.mentionedRestaurant} isn’t in our directory yet
            </Text>
            <View style={styles.notFoundActions}>
              <Pressable
                style={[styles.aiMenuBtn, { backgroundColor: Colors.brand.primary }]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  router.push(`/ai-menu/${encodeURIComponent(intent.mentionedRestaurant!)}`);
                }}
              >
                <Ionicons name="sparkles" size={13} color="#fff" />
                <Text style={styles.aiMenuBtnText}>View AI Menu</Text>
              </Pressable>
              <Pressable onPress={onRequestRestaurant} style={styles.requestBtnSmall}>
                <Text style={styles.requestBtnSmallText}>Request it</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      {intent && (
        <View style={[styles.intentBanner, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good }]}>
          <View style={styles.intentLeft}>
            <Ionicons name="sparkles" size={14} color={Colors.brand.primary} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.intentSummary, { color: Colors.brand.primaryDark }]}>
                {intent.summary}
              </Text>
              <Text style={[styles.intentSub, { color: Colors.brand.primary }]}>
                {results.length} matching {results.length === 1 ? "item" : "items"} across all restaurants
              </Text>
            </View>
          </View>
          <Pressable onPress={onClear} style={styles.clearBtn}>
            <Text style={[styles.clearBtnText, { color: Colors.brand.primaryDark }]}>Browse</Text>
          </Pressable>
        </View>
      )}

      {loading && (
        <View style={[styles.centered, { flex: 1 }]}>
          <View style={styles.aiLoadingWrap}>
            <ActivityIndicator size="large" color={Colors.brand.primary} />
            <Text style={[styles.aiLoadingTitle, { color: c.textPrimary }]}>
              Understanding your search...
            </Text>
            <Text style={[styles.aiLoadingText, { color: c.textSecondary }]}>
              Matching items by health criteria
            </Text>
          </View>
        </View>
      )}

      {error && !loading && (
        <View style={[styles.centered, { flex: 1 }]}>
          <Ionicons name="alert-circle-outline" size={40} color={Colors.brand.avoid} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>Search failed</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>{error}</Text>
          <Pressable onPress={onClear} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Go back</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && results.length === 0 && intent && (
        <View style={[styles.centered, { flex: 1 }]}>
          <Ionicons name="search-outline" size={48} color={c.textMuted} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No matches found</Text>
          <Text style={[styles.emptyText, { color: c.textSecondary }]}>
            Try a broader search like “low carb” or “healthy dinner”
          </Text>
          <Pressable onPress={onClear} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Browse all restaurants</Text>
          </Pressable>
        </View>
      )}

      {!loading && results.length > 0 && (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.restaurant.id}-${item.item.id}`}
          contentContainerStyle={[styles.smartList, { paddingBottom: bottomPad + 100 }]}
          showsVerticalScrollIndicator={false}
          renderItem={({ item: result }) => {
            return (
              <Pressable
                onPress={() => onItemPress(result)}
                style={({ pressed }) => [
                  styles.smartCard,
                  { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.92 : 1 },
                ]}
              >
                <View style={styles.smartCardTop}>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.smartItemName, { color: c.textPrimary }]} numberOfLines={1}>
                      {result.item.name}
                    </Text>
                    <View style={styles.smartRestaurantRow}>
                      <Ionicons name="storefront-outline" size={11} color={c.textMuted} />
                      <Text style={[styles.smartRestaurantName, { color: c.textMuted }]}>
                        {" "}{result.restaurant.name}
                      </Text>
                      <Text style={[styles.smartDot, { color: c.textMuted }]}> · </Text>
                      <Ionicons name="location-outline" size={11} color={c.textMuted} />
                      <Text style={[styles.smartRestaurantName, { color: c.textMuted }]}>
                        {" "}{result.restaurant.distance}
                      </Text>
                    </View>
                    <Text style={[styles.smartDesc, { color: c.textSecondary }]} numberOfLines={2}>
                      {result.item.description}
                    </Text>
                  </View>
                  <View style={styles.smartRight}>
                    <Text style={[styles.smartPrice, { color: c.textPrimary }]}>{result.item.price}</Text>
                    {(() => {
                      const cal = result.item.nutrients?.find(
                        (n) => n.label === "Calories"
                      );
                      return cal ? (
                        <View style={styles.smartCalRow}>
                          <Ionicons name="flame-outline" size={11} color={c.textMuted} />
                          <Text style={[styles.smartCarbs, { color: c.textMuted }]}>{cal.value} cal</Text>
                        </View>
                      ) : null;
                    })()}
                    <Text style={[styles.smartCarbs, { color: c.textMuted }]}>{result.item.carbRange}</Text>
                  </View>
                </View>

                {(() => {
                  const impact = getBloodSugarImpact(result.item.nutrients, dietGoal, result.item.diabeticScore);
                  const why = getWhyText(result.item.nutrients);
                  return (
                    <>
                      <View style={[styles.smartImpactRow, { backgroundColor: impact.rowBg }]}>
                        <Text style={styles.smartImpactLabel}>Blood Sugar Impact</Text>
                        <View style={[styles.smartImpactBadge, { backgroundColor: impact.badgeBg }]}>
                          <Text style={[styles.smartImpactBadgeText, { color: impact.badgeText }]}>{impact.label}</Text>
                        </View>
                      </View>
                      <View style={[styles.smartWhyRow, { borderColor: c.border }]}>
                        <Text style={[styles.smartWhyText, { color: c.textSecondary }]}>{why}</Text>
                      </View>
                    </>
                  );
                })()}

                <View style={styles.smartCardBottom}>
                  <ScoreTag score={result.item.diabeticScore as any} size="sm" />
                </View>

                {result.item.quickTip ? (
                  <View style={[styles.smartTip, { backgroundColor: Colors.brand.goodLight }]}>
                    <Ionicons name="bulb-outline" size={11} color={Colors.brand.primary} />
                    <Text style={[styles.smartTipText, { color: Colors.brand.primaryDark }]} numberOfLines={1}>
                      {" "}{result.item.quickTip}
                    </Text>
                  </View>
                ) : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 14 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  headerLabel: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.6)", marginBottom: 4 },
  locationRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  locationText: { fontFamily: "Inter_700Bold", fontSize: 20, color: "#fff" },
  logoWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center" },
  searchRow: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 14, paddingHorizontal: 14, height: 46 },
  searchRowActive: { backgroundColor: "rgba(34,197,94,0.2)", borderWidth: 1, borderColor: Colors.brand.primaryLight },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 15, color: "#fff", height: "100%" },
  safeBtn: {
    marginTop: 10,
    marginHorizontal: 0,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.15)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    overflow: "hidden" as const,
  },
  safeBtnInner: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  safeBtnIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: "#dcfce7",
    alignItems: "center" as const,
    justifyContent: "center" as const,
  },
  safeBtnTitle: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff" },
  safeBtnSub: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.65)", marginTop: 1 },
  suggestions: { paddingTop: 12, paddingBottom: 2, gap: 8 },
  suggestionChip: { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  suggestionText: { fontFamily: "Inter_500Medium", fontSize: 13, color: "#fff" },
  filterBar: { paddingVertical: 12 },
  filterRowContainer: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, marginBottom: 12 },
  filterScroll: { gap: 8, paddingRight: 12 },
  filterBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20, justifyContent: "center", alignItems: "center" },
  filterText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  sortWrapper: { borderLeftWidth: 1, paddingLeft: 12, marginLeft: 4 },
  sortBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: "transparent" },
  sortText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  cuisineScroll: { paddingHorizontal: 20, gap: 8 },
  cuisineBtn: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1 },
  cuisineText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 20 },
  centered: { alignItems: "center", paddingTop: 60, gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 15 },
  sectionTitle: { fontFamily: "Inter_500Medium", fontSize: 13, marginBottom: 12 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 20 },
  emptyText: { fontFamily: "Inter_400Regular", fontSize: 15, textAlign: "center", paddingHorizontal: 20 },
  similarBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 24 },
  similarBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  emptyActions: { gap: 10, alignItems: "center", marginTop: 4 },
  aiMenuBtnLg: { flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 13, paddingHorizontal: 20, borderRadius: 24 },
  aiMenuBtnLgText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  aiMenuBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 16, alignSelf: "flex-start" },
  aiMenuBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  notFoundActions: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  requestBtnSmall: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12 },
  requestBtnSmallText: { fontFamily: "Inter_500Medium", fontSize: 12, color: Colors.brand.cautionText },
  notFoundBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1, padding: 12 },
  notFoundTitle: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginBottom: 2 },
  notFoundSub: { fontFamily: "Inter_400Regular", fontSize: 12, opacity: 0.85 },
  requestBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: Colors.brand.caution, borderRadius: 8, marginLeft: 8, flexShrink: 0 },
  requestBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  intentBanner: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 12, marginBottom: 4, borderRadius: 12, borderWidth: 1, padding: 12, gap: 10 },
  intentLeft: { flex: 1, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  intentSummary: { fontFamily: "Inter_700Bold", fontSize: 13, marginBottom: 2 },
  intentSub: { fontFamily: "Inter_400Regular", fontSize: 12 },
  clearBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: Colors.brand.primary, borderRadius: 8 },
  clearBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#fff" },
  aiLoadingWrap: { alignItems: "center", gap: 16, padding: 32 },
  aiLoadingTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  aiLoadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  retryBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, backgroundColor: Colors.brand.primary, borderRadius: 10 },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  smartList: { paddingHorizontal: 16, paddingTop: 8, gap: 10 },
  smartCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  smartCardTop: { flexDirection: "row", alignItems: "flex-start" },
  smartItemName: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 4 },
  smartRestaurantRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
  smartRestaurantName: { fontFamily: "Inter_400Regular", fontSize: 12 },
  smartDot: { fontFamily: "Inter_400Regular", fontSize: 12 },
  smartDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  smartRight: { alignItems: "flex-end", gap: 4, minWidth: 60 },
  smartCalRow: { flexDirection: "row", alignItems: "center", gap: 2 },
  smartImpactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4 },
  smartImpactLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#374151" },
  smartImpactBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  smartImpactBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  smartWhyRow: { borderTopWidth: 1, paddingTop: 5, marginBottom: 6, paddingHorizontal: 2 },
  smartWhyText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  smartPrice: { fontFamily: "Inter_700Bold", fontSize: 15 },
  smartCarbs: { fontFamily: "Inter_400Regular", fontSize: 11 },
  smartCardBottom: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  smartTip: { flexDirection: "row", alignItems: "center", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
  smartTipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12 },
  recentlyViewedContainer: { paddingBottom: 4 },
  sectionHeader: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "space-between" as const, paddingHorizontal: 20, marginBottom: 10 },
  recentlyViewedScroll: { paddingHorizontal: 20, gap: 10 },
  recentCard: { width: 160, borderRadius: 12, borderWidth: 1, padding: 12, gap: 6 },
  recentCardHeader: { flexDirection: "row" as const, alignItems: "center" as const, gap: 6 },
  scoreDot: { width: 8, height: 8, borderRadius: 4 },
  recentMealName: { fontFamily: "Inter_600SemiBold", fontSize: 13, flex: 1 },
  recentRestaurantName: { fontFamily: "Inter_400Regular", fontSize: 11 },
  nudgeContainer: {
    flexDirection: "row",
    padding: 16,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "flex-start",
  },
  nudgeIconWrap: {
    marginRight: 12,
    paddingTop: 2,
  },
  nudgeContent: {
    flex: 1,
  },
  nudgeTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 2,
  },
  nudgeSub: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 10,
  },
  nudgeAction: {
    alignSelf: "flex-start",
    backgroundColor: Colors.brand.primary,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  nudgeActionText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  nudgeClose: {
    padding: 4,
    marginLeft: 8,
  },
});
