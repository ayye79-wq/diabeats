import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  Linking,
  Share,
  ActivityIndicator,
  TextInput,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { trackEvent } from "@/lib/trackEvent";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import Colors from "@/constants/colors";
import type { MenuItem, OrderStep, Restaurant } from "@/data/restaurants";
import { RESTAURANTS } from "@/data/restaurants";
import { ScoreTag } from "@/components/ScoreTag";
import { ShareOrderCard } from "@/components/ShareOrderCard";
import { useApp } from "@/context/AppContext";
import { getBloodSugarImpact, getWhyText } from "@/lib/mealInsights";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/context/SubscriptionContext";
import { bestMealResultSchema } from "@/shared/ai-safety";

const SCORE_ORDER = { good: 0, caution: 1, avoid: 2 };

export default function RestaurantScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const { isRestaurantSaved, toggleSaveRestaurant, isMealSaved, toggleSaveMeal, dietGoal, dietPreference } = useApp();
  const { isPremium, showPaywall } = useSubscription();

  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [orderCardItem, setOrderCardItem] = useState<{ item: MenuItem; steps: OrderStep[]; restaurantName: string } | null>(null);

  const staticOrderSteps = React.useMemo(() => {
    const staticR = RESTAURANTS.find((r) => r.id === id);
    const map: Record<string, OrderStep[]> = {};
    staticR?.menuItems.forEach((m) => { if (m.orderSteps?.length) map[m.id] = m.orderSteps; });
    return map;
  }, [id]);

  type BestMealResult = ReturnType<typeof bestMealResultSchema.parse>;
  const [bestMeal, setBestMeal] = useState<BestMealResult | null>(null);
  const [bestMealLoading, setBestMealLoading] = useState(false);
  const [bestMealError, setBestMealError] = useState<string | null>(null);
  const [showBestMeal, setShowBestMeal] = useState(false);

  const fetchBestMeal = async () => {
    if (!restaurant) return;
    setBestMealLoading(true);
    setBestMealError(null);
    try {
      const res = await apiRequest("POST", "/api/best-meal", {
        restaurantName: restaurant.name,
        cuisineType: restaurant.cuisine,
        menuItems: restaurant.menuItems.map((m) => ({
          name: m.name,
          description: m.description,
          diabeticScore: m.diabeticScore,
          carbRange: m.carbRange,
        })),
        dietGoal,
        dietPreference,
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const validated = bestMealResultSchema.safeParse(data);
      if (!validated.success) throw new Error("The recommendation was incomplete.");
      setBestMeal(validated.data);
    } catch {
      setBestMealError("Could not generate recommendation. Please try again.");
    } finally {
      setBestMealLoading(false);
    }
  };

  const handleBestMealPress = () => {
    if (!isPremium) {
      showPaywall("best-meal");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setShowBestMeal((v) => !v);
    if (!bestMeal && !bestMealLoading) {
      if (restaurant) trackEvent("best_meal_requested", { restaurantId: restaurant.id, restaurantName: restaurant.name });
      fetchBestMeal();
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  const { data: restaurant, isLoading, isError } = useQuery<Restaurant>({
    queryKey: ["/api/restaurants", id],
  });

  useEffect(() => {
    if (restaurant) {
      trackEvent("restaurant_viewed", { restaurantId: restaurant.id, restaurantName: restaurant.name });
    }
  }, [restaurant]);

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
      </View>
    );
  }

  if (isError || !restaurant) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad + 20 }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </Pressable>
        <Text style={[styles.notFound, { color: c.textPrimary }]}>Restaurant not found</Text>
      </View>
    );
  }

  const categories = ["All", ...Array.from(new Set(restaurant.menuItems.map((m) => m.category)))];

  const filteredItems = restaurant.menuItems
    .filter((m) => 
      searchQuery === "" || 
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      m.description.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .filter((m) => categoryFilter === "All" || m.category === categoryFilter)
    .sort((a, b) => SCORE_ORDER[a.diabeticScore as keyof typeof SCORE_ORDER] - SCORE_ORDER[b.diabeticScore as keyof typeof SCORE_ORDER]);

  const goodCount = restaurant.menuItems.filter((m) => m.diabeticScore === "good").length;


  const openMaps = () => {
    const encoded = encodeURIComponent(restaurant.address);
    const url =
      Platform.OS === "ios"
        ? `maps://maps.apple.com/?q=${encoded}`
        : `https://maps.google.com/?q=${encoded}`;
    Linking.openURL(url);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out ${restaurant.name} on DiabEats! ${goodCount} of ${restaurant.menuItems.length} menu items are rated diabetes-friendly.\n\n${restaurant.address}`,
      });
    } catch {}
  };

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={["#0E2016", "#166534"]}
        style={[styles.headerGradient, { paddingTop: topPad }]}
      >
        <View style={styles.headerNav}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.navBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.headerNavRight}>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); handleShare(); }}
              style={styles.navBtn}
            >
              <Ionicons name="share-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); toggleSaveRestaurant(restaurant.id); }}
              style={styles.navBtn}
            >
              <Ionicons
                name={isRestaurantSaved(restaurant.id) ? "heart" : "heart-outline"}
                size={20}
                color={isRestaurantSaved(restaurant.id) ? "#FF6B6B" : "#fff"}
              />
            </Pressable>
          </View>
        </View>

        <View style={styles.headerContent}>
          <Text style={styles.restaurantName}>{restaurant.name}</Text>
          <Text style={styles.restaurantCuisine}>
            {restaurant.cuisine} · {restaurant.priceLevel}
          </Text>

          <View style={styles.headerMeta}>
            <View style={styles.metaItem}>
              <Ionicons name="star" size={14} color={Colors.brand.accent} />
              <Text style={styles.metaText}>
                {" "}{restaurant.rating} ({restaurant.reviewCount})
              </Text>
            </View>
            <Text style={styles.metaDot}>·</Text>
            <View style={styles.metaItem}>
              <Ionicons name="location-outline" size={14} color="rgba(255,255,255,0.7)" />
              <Text style={styles.metaText}>{" "}{restaurant.distance}</Text>
            </View>
          </View>

          <View style={styles.scoreRow}>
            <View style={[styles.scorePill, { backgroundColor: Colors.brand.goodLight, gap: 6 }]}>
              <Ionicons name="checkmark-circle" size={14} color={Colors.brand.goodText} />
              <Text style={[styles.scorePillText, { color: Colors.brand.goodText }]}>
                {goodCount >= 5 ? "5+" : goodCount} lower-carb {goodCount === 1 ? "option" : "options"}
              </Text>
              <View style={{ flexDirection: "row", gap: 2, alignItems: "center" }}>
                {restaurant.menuItems.slice(0, Math.min(restaurant.menuItems.length, 8)).map((_, i) => (
                  <View
                    key={i}
                    style={{
                      width: 5,
                      height: 5,
                      borderRadius: 3,
                      backgroundColor: i < goodCount
                        ? Colors.brand.goodText
                        : "rgba(255,255,255,0.35)",
                    }}
                  />
                ))}
                {restaurant.menuItems.length > 8 && (
                  <Text style={{ color: Colors.brand.goodText, fontSize: 9, marginLeft: 1 }}>+</Text>
                )}
              </View>
            </View>
            {restaurant.dietitianReviewed && (
              <View style={[styles.scorePill, { backgroundColor: Colors.brand.accentLight, marginLeft: 8 }]}>
                <Ionicons name="medical" size={14} color={Colors.brand.accent} />
                <Text style={[styles.scorePillText, { color: Colors.brand.accent }]}>
                  {" "}Dietitian Reviewed
                </Text>
              </View>
            )}
          </View>
        </View>

        <View style={styles.actionRow}>
          <Pressable onPress={openMaps} style={[styles.actionBtn, { flex: 1 }]}>
            <Ionicons name="navigate-outline" size={18} color="#fff" />
            <Text style={styles.actionBtnText}>Get Directions</Text>
          </Pressable>
        </View>

      </LinearGradient>

      <View style={[styles.bestMealBar, { backgroundColor: c.background, borderBottomColor: c.border }]}>
        <Pressable
          style={({ pressed }) => [
            styles.bestMealBtn,
            {
              backgroundColor: isPremium ? Colors.brand.primary : c.cardBg,
              borderColor: isPremium ? Colors.brand.primary : c.border,
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          onPress={handleBestMealPress}
        >
          <Ionicons name="star" size={15} color={isPremium ? "#fff" : Colors.brand.primary} />
          <Text style={[styles.bestMealBtnText, { color: isPremium ? "#fff" : Colors.brand.primary }]}>
            Best Meal Pick
          </Text>
          {!isPremium && (
            <View style={[styles.premiumTag, { backgroundColor: Colors.brand.primary }]}>
              <Text style={styles.premiumTagText}>Premium</Text>
            </View>
          )}
          {isPremium && (
            <Ionicons
              name={showBestMeal ? "chevron-up" : "chevron-down"}
              size={14}
              color="rgba(255,255,255,0.8)"
            />
          )}
        </Pressable>
      </View>

      {showBestMeal && isPremium && (
        <View style={[styles.bestMealCard, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good + "60" }]}>
          {bestMealLoading && (
            <View style={styles.bestMealLoading}>
              <ActivityIndicator size="small" color={Colors.brand.primary} />
              <Text style={[styles.bestMealLoadingText, { color: Colors.brand.primary }]}>
                Finding your best option…
              </Text>
            </View>
          )}
          {bestMealError && (
            <View style={styles.bestMealLoading}>
              <Text style={[styles.bestMealLoadingText, { color: Colors.brand.avoidText }]}>{bestMealError}</Text>
              <Pressable onPress={fetchBestMeal} style={styles.retryBtn}>
                <Text style={styles.retryText}>Retry</Text>
              </Pressable>
            </View>
          )}
          {bestMeal && !bestMealLoading && (
            <>
              <View style={styles.bestMealHeader}>
                <View style={[styles.bestMealIconWrap, { backgroundColor: Colors.brand.primary }]}>
                  <Ionicons name="star" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bestMealLabel, { color: Colors.brand.primary }]}>AI comparison suggestion</Text>
                  <Text style={[styles.bestMealName, { color: Colors.brand.goodText }]}>{bestMeal.recommendedMeal}</Text>
                </View>
                <View style={[styles.bestMealCarbBadge, { backgroundColor: Colors.brand.primary + "20" }]}>
                  <Text style={[styles.bestMealCarbText, { color: Colors.brand.primary }]}>{bestMeal.estimatedCarbs}</Text>
                </View>
              </View>
              <Text style={[styles.bestMealReason, { color: Colors.brand.goodText }]}>{bestMeal.reason}</Text>
              <Text style={[styles.bestMealReason, { color: Colors.brand.goodText, fontSize: 11 }]}>Confidence: {bestMeal.confidence} · Source: {bestMeal.evidence.source}</Text>
              <Text style={[styles.bestMealReason, { color: Colors.brand.goodText, fontSize: 11 }]}>Used: {bestMeal.informationUsed.join(" · ")}</Text>
              <Text style={[styles.bestMealReason, { color: Colors.brand.goodText, fontSize: 11 }]}>{bestMeal.limitations}</Text>
              <Text style={[styles.bestMealReason, { color: Colors.brand.goodText, fontSize: 11 }]}>{bestMeal.verification}</Text>
              {bestMeal.tips?.length > 0 && (
                <View style={styles.bestMealTips}>
                  {bestMeal.tips.map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <Ionicons name="bulb-outline" size={13} color={Colors.brand.primary} style={{ marginTop: 1 }} />
                      <Text style={[styles.tipText, { color: Colors.brand.goodText }]}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}
              {bestMeal.modification && (
                <View style={[styles.modRow, { backgroundColor: Colors.brand.primary + "12" }]}>
                  <Ionicons name="swap-horizontal-outline" size={14} color={Colors.brand.primary} />
                  <Text style={[styles.modText, { color: Colors.brand.primary }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>Tip: </Text>
                    {bestMeal.modification}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>
      )}

      <View style={[styles.searchContainer, { backgroundColor: c.background }]}>
        <View style={[styles.searchBar, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Ionicons name="search-outline" size={18} color={c.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: c.textPrimary }]}
            accessibilityLabel="Search restaurant menu items"
            placeholder="Search menu items..."
            placeholderTextColor={c.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
          />
          {searchQuery !== "" && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={10}>
              <Ionicons name="close-circle" size={18} color={c.textMuted} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={[styles.categoryBar, { backgroundColor: c.background }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryContent}>
          {categories.map((cat) => (
            <Pressable
              key={cat}
              onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); setCategoryFilter(cat); }}
              style={[
                styles.categoryChip,
                {
                  backgroundColor: categoryFilter === cat ? Colors.brand.primary : c.cardBg,
                  borderColor: categoryFilter === cat ? Colors.brand.primary : c.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.categoryText,
                  { color: categoryFilter === cat ? "#fff" : c.textSecondary },
                ]}
              >
                {cat}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.menuList}
        contentContainerStyle={[
          styles.menuContent,
          { paddingBottom: bottomPad + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {filteredItems.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={c.textMuted} style={{ marginBottom: 12 }} />
            <Text style={[styles.emptyText, { color: c.textSecondary }]}>
              No results for “{searchQuery}”
            </Text>
            <Pressable 
              onPress={() => { setSearchQuery(""); setCategoryFilter("All"); }}
              style={styles.clearSearchBtn}
            >
              <Text style={styles.clearSearchText}>Clear search</Text>
            </Pressable>
          </View>
        ) : (
          filteredItems.map((item) => (
            <MenuItemCard
              key={item.id}
              item={item}
              restaurant={restaurant}
              saved={isMealSaved(item.id)}
              dietGoal={dietGoal}
              onToggleSave={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const saving = !isMealSaved(item.id);
                trackEvent(saving ? "meal_saved" : "meal_unsaved", { restaurantId: restaurant.id, restaurantName: restaurant.name, itemId: item.id, itemName: item.name });
                toggleSaveMeal(item.id);
              }}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                trackEvent("meal_clicked", { restaurantId: restaurant.id, restaurantName: restaurant.name, itemId: item.id, itemName: item.name });
                router.push(`/meal/${restaurant.id}/${item.id}`);
              }}
              itemOrderSteps={staticOrderSteps[item.id]}
              onOrderSafely={() => {
                const steps = staticOrderSteps[item.id];
                if (steps?.length) {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  trackEvent("order_guide_opened", { restaurantId: restaurant.id, restaurantName: restaurant.name, itemId: item.id, itemName: item.name });
                  setOrderCardItem({ item, steps, restaurantName: restaurant.name });
                }
              }}
            />
          ))
        )}
      </ScrollView>

      {orderCardItem && (
        <ShareOrderCard
          visible={!!orderCardItem}
          onClose={() => setOrderCardItem(null)}
          restaurantName={orderCardItem.restaurantName}
          mealName={orderCardItem.item.name}
          diabeticScore={orderCardItem.item.diabeticScore as "good" | "caution" | "avoid"}
          orderSteps={orderCardItem.steps}
        />
      )}

    </View>
  );
}

function MenuItemCard({
  item,
  restaurant,
  saved,
  dietGoal,
  onToggleSave,
  onPress,
  itemOrderSteps,
  onOrderSafely,
}: {
  item: MenuItem;
  restaurant: Restaurant;
  saved: boolean;
  dietGoal: import("@/context/AppContext").DietGoal;
  onToggleSave: () => void;
  onPress: () => void;
  itemOrderSteps?: OrderStep[];
  onOrderSafely?: () => void;
}) {
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuCard,
        { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.9 : 1 },
      ]}
    >
      <View style={styles.menuCardTop}>
        <View style={styles.menuCardMain}>
          <Text style={[styles.menuName, { color: c.textPrimary }]} numberOfLines={2}>
            {item.name}
          </Text>
          <Text style={[styles.menuDesc, { color: c.textSecondary }]} numberOfLines={2}>
            {item.description}
          </Text>
        </View>
        <View style={styles.menuCardRight}>
          <Text style={[styles.menuPrice, { color: c.textPrimary }]}>{item.price}</Text>
          <Pressable onPress={onToggleSave} hitSlop={10} style={{ marginTop: 8 }}>
            <Ionicons
              name={saved ? "bookmark" : "bookmark-outline"}
              size={18}
              color={saved ? Colors.brand.primary : c.textMuted}
            />
          </Pressable>
        </View>
      </View>

      <View style={styles.menuCardBottom}>
        <ScoreTag score={item.diabeticScore as any} size="sm" />
        <View style={styles.metaPills}>
          {(() => {
            const cal = (item.nutrients as { label: string; value: string }[])?.find(
              (n) => n.label === "Calories"
            );
            return cal ? (
              <View style={[styles.calPill, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Ionicons name="flame-outline" size={11} color={c.textMuted} />
                <Text style={[styles.calText, { color: c.textMuted }]}>{cal.value} cal</Text>
              </View>
            ) : null;
          })()}
          <Text style={[styles.carbRange, { color: c.textMuted }]}>{item.carbRange}</Text>
          {itemOrderSteps && itemOrderSteps.length > 0 && (
            <View style={styles.orderGuidePill}>
              <Ionicons name="list-outline" size={10} color={Colors.brand.primary} />
              <Text style={styles.orderGuidePillText}>Order Guide</Text>
            </View>
          )}
        </View>
        <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
      </View>

      {(() => {
        const nutrients = item.nutrients as { label: string; value: string }[];
        const impact = getBloodSugarImpact(nutrients, dietGoal, item.diabeticScore);
        const why = getWhyText(nutrients);
        return (
          <>
            <View style={[styles.impactRow, { backgroundColor: impact.rowBg }]}>
          <Text style={styles.impactLabel}>Meal Pattern</Text>
              <View style={[styles.impactBadge, { backgroundColor: impact.badgeBg }]}>
                <Text style={[styles.impactBadgeText, { color: impact.badgeText }]}>{impact.label}</Text>
              </View>
            </View>
            <View style={[styles.whyRow, { borderColor: c.border }]}>
              <Text style={[styles.whyText, { color: c.textSecondary }]}>{why}</Text>
            </View>
          </>
        );
      })()}

      {item.quickTip && (
        <View style={[styles.tipRow, { backgroundColor: Colors.brand.goodLight }]}>
          <Ionicons name="bulb-outline" size={13} color={Colors.brand.primary} />
          <Text style={[styles.tipText, { color: Colors.brand.primaryDark }]} numberOfLines={2}>
            {" "}{item.quickTip}
          </Text>
        </View>
      )}

      {itemOrderSteps && itemOrderSteps.length > 0 && onOrderSafely && (
        <Pressable
          onPress={(e) => { e.stopPropagation(); onOrderSafely(); }}
          style={({ pressed }) => [styles.orderSafelyBtn, { opacity: pressed ? 0.85 : 1 }]}
          testID="order-safely-btn"
        >
          <Ionicons name="list-outline" size={15} color="#fff" />
          <Text style={styles.orderSafelyBtnText}>Open Ordering Guide</Text>
          <Ionicons name="chevron-forward" size={15} color="rgba(255,255,255,0.7)" />
        </Pressable>
      )}

    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 16 },
  headerNav: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12 },
  headerNavRight: { flexDirection: "row", gap: 8 },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  headerContent: { paddingVertical: 8 },
  restaurantName: { fontFamily: "Inter_700Bold", fontSize: 26, color: "#fff", marginBottom: 4 },
  restaurantCuisine: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 12 },
  headerMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  metaItem: { flexDirection: "row", alignItems: "center" },
  metaText: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.8)" },
  metaDot: { color: "rgba(255,255,255,0.4)", fontSize: 13 },
  scoreRow: { flexDirection: "row", marginBottom: 8 },
  scorePill: { flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  scorePillText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  actionRow: { flexDirection: "row", gap: 10, marginTop: 8 },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.18)", borderRadius: 12, paddingVertical: 12 },
  actionBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  searchContainer: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
    borderWidth: 1,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    padding: 0,
  },
  categoryBar: { paddingVertical: 12 },
  categoryContent: { paddingHorizontal: 20, gap: 8 },
  categoryChip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  categoryText: { fontFamily: "Inter_500Medium", fontSize: 13 },
  menuList: { flex: 1 },
  menuContent: { paddingHorizontal: 16, gap: 10 },
  emptyState: { 
    alignItems: "center", 
    justifyContent: "center", 
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyText: { 
    fontFamily: "Inter_500Medium", 
    fontSize: 16, 
    textAlign: "center",
    marginBottom: 16,
  },
  clearSearchBtn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: Colors.brand.primary + "10",
    borderRadius: 20,
  },
  clearSearchText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: Colors.brand.primary,
  },
  menuCard: { borderRadius: 14, borderWidth: 1, padding: 14, ...Platform.select({ web: { boxShadow: "0px 1px 4px rgba(0,0,0,0.05)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 1 } }) },
  menuCardTop: { flexDirection: "row", marginBottom: 10 },
  menuCardMain: { flex: 1, marginRight: 8 },
  menuName: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 4 },
  menuDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  menuCardRight: { alignItems: "flex-end" },
  menuPrice: { fontFamily: "Inter_700Bold", fontSize: 15 },
  menuCardBottom: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  metaPills: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6 },
  calPill: { flexDirection: "row", alignItems: "center", gap: 3, borderRadius: 8, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2 },
  calText: { fontFamily: "Inter_400Regular", fontSize: 11 },
  carbRange: { fontFamily: "Inter_400Regular", fontSize: 12, color: "gray" },
  orderGuidePill: { flexDirection: "row" as const, alignItems: "center" as const, gap: 3, borderRadius: 8, backgroundColor: "#dcfce7", paddingHorizontal: 6, paddingVertical: 2 },
  orderGuidePillText: { fontFamily: "Inter_600SemiBold", fontSize: 10, color: Colors.brand.primary },
  orderSafelyBtn: { flexDirection: "row" as const, alignItems: "center" as const, justifyContent: "center" as const, gap: 7, backgroundColor: Colors.brand.primary, borderRadius: 12, paddingVertical: 12, marginTop: 10, marginHorizontal: 0 },
  orderSafelyBtnText: { fontFamily: "Inter_700Bold", fontSize: 14, color: "#fff", flex: 1, textAlign: "center" as const },
  impactRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 7, marginBottom: 4 },
  impactLabel: { fontFamily: "Inter_600SemiBold", fontSize: 12, color: "#374151" },
  impactBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2 },
  impactBadgeText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.5 },
  whyRow: { borderTopWidth: 1, paddingTop: 6, marginBottom: 8, paddingHorizontal: 2 },
  whyText: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 16 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", borderRadius: 8, padding: 10 },
  tipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  backBtn: { padding: 8, marginLeft: 12, marginBottom: 20 },
  notFound: { fontFamily: "Inter_600SemiBold", fontSize: 18, textAlign: "center" },
  bestMealBar: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  bestMealBtn: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 1 },
  bestMealBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, flex: 1 },
  premiumTag: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  premiumTagText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff", letterSpacing: 0.3 },
  bestMealCard: { marginHorizontal: 16, marginBottom: 4, borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  bestMealLoading: { alignItems: "center", gap: 8, paddingVertical: 8 },
  bestMealLoadingText: { fontFamily: "Inter_400Regular", fontSize: 13 },
  retryBtn: { paddingHorizontal: 16, paddingVertical: 6, backgroundColor: Colors.brand.primary, borderRadius: 8 },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  bestMealHeader: { flexDirection: "row", alignItems: "center", gap: 12 },
  bestMealIconWrap: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  bestMealLabel: { fontFamily: "Inter_500Medium", fontSize: 11, marginBottom: 2 },
  bestMealName: { fontFamily: "Inter_700Bold", fontSize: 16 },
  bestMealCarbBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  bestMealCarbText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  bestMealReason: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  bestMealTips: { gap: 6 },
  modRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 8, padding: 10 },
  modText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
});
