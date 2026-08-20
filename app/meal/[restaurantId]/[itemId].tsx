import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  ActivityIndicator,
  Share,
  Alert,
  Linking,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import { trackEvent } from "@/lib/trackEvent";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import { useQuery } from "@tanstack/react-query";

import * as Notifications from "expo-notifications";

import Colors from "@/constants/colors";
import type { Restaurant } from "@/data/restaurants";
import { RESTAURANTS } from "@/data/restaurants";
import { ScoreTag } from "@/components/ScoreTag";
import { ShareOrderCard } from "@/components/ShareOrderCard";
import { SimulatorModal } from "@/components/SimulatorModal";
import { useApp } from "@/context/AppContext";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/context/SubscriptionContext";
import { mealAnalysisSchema } from "@/shared/ai-safety";

async function scheduleOutcomeReminder(mealName: string) {
  if (Platform.OS === "web") return;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: "How did that meal go?",
        body: `Record how ${mealName} affected your blood sugar.`,
        data: { screen: "saved", tab: "logs" },
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 * 60 * 60, repeats: false },
    });
  } catch {}
}

type MealAnalysis = ReturnType<typeof mealAnalysisSchema.parse>;

const IMPACT_COLORS: Record<string, { bg: string; text: string }> = {
  good: { bg: Colors.brand.goodLight, text: Colors.brand.goodText },
  caution: { bg: Colors.brand.cautionLight, text: Colors.brand.cautionText },
  avoid: { bg: Colors.brand.avoidLight, text: Colors.brand.avoidText },
};

function parseGrams(value: string | undefined): number | null {
  if (!value) return null;
  const n = parseFloat(value.replace(/[^\d.]/g, ""));
  return isNaN(n) ? null : n;
}

function getNutrient(nutrients: { label: string; value: string }[], ...keys: string[]): number | null {
  for (const key of keys) {
    const found = nutrients.find((n) => n.label.toLowerCase().includes(key.toLowerCase()));
    if (found) return parseGrams(found.value);
  }
  return null;
}

function parseCarbRangeMidpoint(carbRange: string): number | null {
  const nums = carbRange.match(/\d+/g);
  if (!nums || nums.length === 0) return null;
  const values = nums.map(Number);
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

interface SpikeFactors {
  level: "low" | "moderate" | "high";
  carbs: number | null;
  fiber: number | null;
  protein: number | null;
  netCarbs: number | null;
  glycemicLoad: string | null;
}

function computeSpike(
  nutrients: { label: string; value: string }[],
  carbRange: string,
  glycemicLoad?: string | null,
  diabeticScore?: string
): SpikeFactors {
  const carbs = getNutrient(nutrients, "carb") ?? parseCarbRangeMidpoint(carbRange);
  const fiber = getNutrient(nutrients, "fiber");
  const protein = getNutrient(nutrients, "protein");
  const netCarbs = carbs !== null && fiber !== null ? Math.max(0, carbs - fiber) : carbs;

  let level: "low" | "moderate" | "high" =
    netCarbs === null ? "moderate" : netCarbs < 20 ? "low" : netCarbs <= 45 ? "moderate" : "high";

  // Align with the dietitian-reviewed diabeticScore — formula is only an estimate
  if (diabeticScore === "good") level = "low";
  else if (diabeticScore === "caution" && level === "low") level = "moderate";
  else if (diabeticScore === "avoid") level = "high";

  return {
    level,
    carbs,
    fiber,
    protein,
    netCarbs,
    glycemicLoad: glycemicLoad ?? null,
  };
}

export default function MealDetailScreen() {
  const { restaurantId, itemId } = useLocalSearchParams<{
    restaurantId: string;
    itemId: string;
  }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const { isMealSaved, toggleSaveMeal, mealLog, logMeal, addRecentlyViewed } = useApp();
  const { isPremium, showPaywall } = useSubscription();

  const isLoggedToday = React.useMemo(() => {
    const today = new Date();
    return mealLog.some(
      (entry) =>
        entry.menuItemId === itemId &&
        new Date(entry.loggedAt).toDateString() === today.toDateString()
    );
  }, [mealLog, itemId]);

  const { data: restaurant, isLoading: restaurantLoading, isError: restaurantError, refetch } = useQuery<Restaurant>({
    queryKey: ["/api/restaurants", restaurantId],
    enabled: !!restaurantId,
  });

  const meal = restaurant?.menuItems?.find((m) => m.id === itemId);

  const { data: confidence } = useQuery<{ count: number; itemId: string }>({
    queryKey: [`/api/confidence/${itemId}`],
    enabled: !!itemId,
    staleTime: 1000 * 60 * 5,
  });

  const [analysis, setAnalysis] = useState<MealAnalysis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkedSteps, setCheckedSteps] = useState<Set<number>>(new Set());
  const [showOrderCard, setShowOrderCard] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);

  const orderSteps = React.useMemo(() => {
    const staticRestaurant = RESTAURANTS.find((r) => r.id === restaurantId);
    return staticRestaurant?.menuItems.find((m) => m.id === itemId)?.orderSteps ?? null;
  }, [restaurantId, itemId]);

  const spikeData = React.useMemo(() => {
    if (!meal) return null;
    return computeSpike(
      meal.nutrients as { label: string; value: string }[],
      meal.carbRange,
      (meal as any).glycemicLoad ?? null,
      meal.diabeticScore
    );
  }, [meal]);

  const toggleStep = useCallback((index: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCheckedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index); else next.add(index);
      return next;
    });
  }, []);

  const fetchAnalysis = useCallback(async () => {
    if (!meal) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("POST", "/api/meal-analysis", {
        mealName: meal.name,
        description: meal.description,
        nutrients: meal.nutrients,
        diabeticScore: meal.diabeticScore,
      });
      const data = await res.json();
      const validated = mealAnalysisSchema.safeParse(data);
      if (!validated.success) throw new Error("The AI analysis was incomplete.");
      setAnalysis(validated.data);
    } catch {
      setError("Unable to load AI analysis. Showing basic information.");
    } finally {
      setLoading(false);
    }
  }, [meal]);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const scoreColors = IMPACT_COLORS[meal?.diabeticScore ?? "caution"];

  useEffect(() => {
    if (meal && restaurant) {
      addRecentlyViewed({
        restaurantId: restaurant.id,
        menuItemId: meal.id,
        restaurantName: restaurant.name,
        mealName: meal.name,
        diabeticScore: meal.diabeticScore as "good" | "caution" | "avoid",
        carbRange: meal.carbRange,
      });
      trackEvent("meal_detail_viewed", { restaurantId: restaurant.id, restaurantName: restaurant.name, itemId: meal.id, itemName: meal.name });
    }
  }, [meal, restaurant, addRecentlyViewed]);

  useEffect(() => {
    if (!meal || !isPremium) return;
    fetchAnalysis();
  }, [meal, isPremium, fetchAnalysis]);

  const handleLogMeal = useCallback(() => {
    if (!meal || !restaurant) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

    if (Platform.OS === "web") {
      const note = window.prompt("Add a blood sugar note? (optional)");
      logMeal({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        menuItemId: meal.id,
        mealName: meal.name,
        diabeticScore: meal.diabeticScore as any,
        carbRange: meal.carbRange,
        bloodSugarNote: note || undefined,
      });
      return;
    }

    Alert.prompt(
      "Log this meal",
      "Add a blood sugar note? (optional)",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Meal",
          onPress: (note: string | undefined) => {
            logMeal({
              restaurantId: restaurant.id,
              restaurantName: restaurant.name,
              menuItemId: meal.id,
              mealName: meal.name,
              diabeticScore: meal.diabeticScore as any,
              carbRange: meal.carbRange,
              bloodSugarNote: note || undefined,
            });
            scheduleOutcomeReminder(meal.name);
          },
        },
      ],
      "plain-text"
    );
  }, [meal, restaurant, logMeal]);

  const handleShare = async () => {
    if (!meal || !restaurant) return;
    try {
      const scoreLabel =
        meal.diabeticScore === "good"
          ? "a Better Choice"
          : meal.diabeticScore === "caution"
          ? "a Moderate Choice"
          : "an item to Limit";
      await Share.share({
        message: `${meal.name} at ${restaurant.name} is rated ${scoreLabel} for diabetics on DiabEats.\n\n${meal.carbRange} · ${meal.price}\n\n"${meal.quickTip}"`,
      });
    } catch {}
  };

  if (restaurantLoading) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator size="large" color={Colors.brand.primary} />
      </View>
    );
  }

  if (restaurantError || (!restaurantLoading && !restaurant)) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad + 60, alignItems: "center", justifyContent: "center", gap: 12 }]}>
        <Pressable onPress={() => router.back()} style={[styles.navBtn, { position: "absolute", top: topPad + 16, left: 16 }]}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </Pressable>
        <Ionicons name="cloud-offline-outline" size={40} color={c.textMuted} />
        <Text style={[styles.notFound, { color: c.textPrimary }]}>Couldn’t load meal</Text>
        <Text style={[styles.notFoundSub, { color: c.textMuted }]}>Check your connection and try again</Text>
        <Pressable
          onPress={() => refetch()}
          style={[styles.retryBtn, { backgroundColor: Colors.brand.primary }]}
        >
          <Text style={styles.retryBtnText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  if (!meal) {
    return (
      <View style={[styles.container, { backgroundColor: c.background, paddingTop: topPad + 60, alignItems: "center", justifyContent: "center", gap: 12 }]}>
        <Pressable onPress={() => router.back()} style={[styles.navBtn, { position: "absolute", top: topPad + 16, left: 16 }]}>
          <Ionicons name="chevron-back" size={24} color={c.textPrimary} />
        </Pressable>
        <Ionicons name="restaurant-outline" size={40} color={c.textMuted} />
        <Text style={[styles.notFound, { color: c.textPrimary }]}>Meal not found</Text>
        <Text style={[styles.notFoundSub, { color: c.textMuted }]}>This item may no longer be available</Text>
      </View>
    );
  }

  // Both meal and restaurant are guaranteed defined here due to early returns above
  const safeRestaurant = restaurant!;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <LinearGradient
        colors={[
          meal.diabeticScore === "good" ? "#0E2016" : meal.diabeticScore === "caution" ? "#1C1400" : "#1C0000",
          meal.diabeticScore === "good" ? "#166534" : meal.diabeticScore === "caution" ? "#92400E" : "#991B1B",
        ]}
        style={[styles.headerGradient, { paddingTop: topPad }]}
      >
        <View style={styles.navRow}>
          <Pressable
            onPress={() => { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light); router.back(); }}
            style={styles.navBtn}
          >
            <Ionicons name="chevron-back" size={24} color="#fff" />
          </Pressable>
          <View style={styles.navRight}>
            <Pressable onPress={handleShare} style={styles.navBtn}>
              <Ionicons name="share-outline" size={20} color="#fff" />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                const saving = !isMealSaved(meal.id);
                trackEvent(saving ? "meal_saved" : "meal_unsaved", { restaurantId: safeRestaurant.id, restaurantName: safeRestaurant.name, itemId: meal.id, itemName: meal.name });
                toggleSaveMeal(meal.id);
              }}
              style={styles.navBtn}
            >
              <Ionicons
                name={isMealSaved(meal.id) ? "bookmark" : "bookmark-outline"}
                size={20}
                color={isMealSaved(meal.id) ? Colors.brand.accentLight : "#fff"}
              />
            </Pressable>
          </View>
        </View>

        <Text style={styles.mealName}>{meal.name}</Text>
        <Text style={styles.restaurantLabel}>
          {safeRestaurant.name} · {meal.category} · {meal.price}
        </Text>
        <Pressable
          onPress={() => {
            const encoded = encodeURIComponent((safeRestaurant as any).address || safeRestaurant.name);
            const url = Platform.OS === "ios"
              ? `maps://maps.apple.com/?q=${encoded}`
              : `https://maps.google.com/?q=${encoded}`;
            Linking.openURL(url).catch(() => {
              Linking.openURL(`https://maps.google.com/?q=${encoded}`);
            });
          }}
          style={styles.directionsBtn}
        >
          <Ionicons name="navigate-outline" size={13} color="rgba(255,255,255,0.85)" />
          <Text style={styles.directionsBtnText}>Get Directions</Text>
        </Pressable>

        <View style={styles.scoreRow}>
          <ScoreTag score={meal.diabeticScore as any} />
          <View style={styles.carbBadge}>
            <Ionicons name="analytics-outline" size={13} color="rgba(255,255,255,0.8)" />
            <Text style={styles.carbText}>{" "}{meal.carbRange}</Text>
          </View>
          {meal.glycemicLoad && (
            <View style={[
              styles.glBadge, 
              { backgroundColor: meal.glycemicLoad === 'low' ? Colors.brand.good : meal.glycemicLoad === 'medium' ? Colors.brand.caution : Colors.brand.avoid }
            ]}>
              <Text style={styles.glText}>{meal.glycemicLoad.toUpperCase()} GL</Text>
            </View>
          )}
        </View>

        <View style={styles.giInfoRow}>
          <Ionicons name="information-circle-outline" size={14} color="rgba(255,255,255,0.6)" />
          <Text style={styles.giInfoText}>
            Glycemic load is one food-pattern reference; it cannot predict your personal response.
          </Text>
        </View>

        <Pressable
          onPress={handleLogMeal}
          disabled={isLoggedToday}
          style={({ pressed }) => [
            styles.logButton,
            {
              backgroundColor: isLoggedToday ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.15)",
              opacity: pressed ? 0.8 : 1,
            },
          ]}
        >
          <Ionicons
            name={isLoggedToday ? "checkmark-circle" : "add-circle-outline"}
            size={18}
            color={isLoggedToday ? Colors.brand.goodLight : "#fff"}
          />
          <Text style={[styles.logButtonText, isLoggedToday && { color: Colors.brand.goodLight }]}>
            {isLoggedToday ? "Logged for today" : "Log this meal"}
          </Text>
        </Pressable>

        {confidence !== undefined && (
          <View style={styles.confidenceRow}>
            {confidence.count >= 1 ? (
              <>
                <View style={styles.confidenceBadge}>
                  <Ionicons name="people" size={13} color={Colors.brand.primary} />
                  <Text style={styles.confidenceCount}>
                    {confidence.count >= 50
                      ? "50+"
                      : confidence.count >= 20
                      ? "20+"
                      : confidence.count}{" "}
                    {confidence.count === 1 ? "person" : "people"} with diabetes chose this
                  </Text>
                </View>
                {meal?.diabeticScore === "good" && (
                  <View style={styles.communityPick}>
                    <Ionicons name="shield-checkmark" size={12} color={Colors.brand.goodText} />
                    <Text style={styles.communityPickText}>Community Popular Choice</Text>
                  </View>
                )}
              </>
            ) : (
              <View style={styles.confidenceBadge}>
                <Ionicons name="star-outline" size={13} color="rgba(255,255,255,0.6)" />
                <Text style={[styles.confidenceCount, { color: "rgba(255,255,255,0.6)" }]}>
                  Be the first to explore this dish
                </Text>
              </View>
            )}
          </View>
        )}
      </LinearGradient>

      <ScrollView
        style={styles.content}
        contentContainerStyle={[styles.contentContainer, { paddingBottom: bottomPad + 60 }]}
        showsVerticalScrollIndicator={false}
      >

        <Text style={[styles.desc, { color: c.textSecondary }]}>{meal.description}</Text>

        <View style={styles.nutrientGrid}>
          {(meal.nutrients as { label: string; value: string }[]).map((n) => (
            <View
              key={n.label}
              style={[styles.nutrientCard, { backgroundColor: c.cardBg, borderColor: c.border }]}
            >
              <Text style={[styles.nutrientValue, { color: c.textPrimary }]}>{n.value}</Text>
              <Text style={[styles.nutrientLabel, { color: c.textMuted }]}>{n.label}</Text>
            </View>
          ))}
        </View>

        {spikeData && (() => {
          const spikeCfg = {
            low:      { bg: "#dcfce7", border: "#bbf7d0", text: "#15803d", label: "LOW IMPACT" },
            moderate: { bg: "#fef9c3", border: "#fde047", text: "#854d0e", label: "MODERATE IMPACT" },
            high:     { bg: "#fee2e2", border: "#fca5a5", text: "#991b1b", label: "HIGH IMPACT" },
          }[spikeData.level];
          return (
            <View style={[styles.spikeCard, { backgroundColor: spikeCfg.bg, borderColor: spikeCfg.border }]}>
              <View style={styles.spikeHeader}>
                <View style={styles.spikeTitleRow}>
                  <Ionicons name="pulse" size={15} color={spikeCfg.text} />
                  <Text style={[styles.spikeSectionLabel, { color: spikeCfg.text }]}>MEAL PATTERN</Text>
                </View>
                <View style={[styles.spikeBadge, { backgroundColor: spikeCfg.text + "20" }]}>
                  <Text style={[styles.spikeBadgeText, { color: spikeCfg.text }]}>{spikeCfg.label}</Text>
                </View>
              </View>

              <Text style={[styles.spikeRiseUnit, { color: spikeCfg.text + "cc", marginBottom: 10 }]}>
                Qualitative comparison from listed meal details—not a glucose prediction
              </Text>

              <View style={[styles.spikeFactorList, { borderTopColor: spikeCfg.border }]}>
                {spikeData.carbs !== null && (
                  <View style={styles.spikeFactorRow}>
                    <Ionicons name="ellipse" size={6} color={spikeCfg.text + "99"} />
                    <Text style={[styles.spikeFactorLabel, { color: spikeCfg.text }]}>Carbohydrates</Text>
                    <Text style={[styles.spikeFactorValue, { color: spikeCfg.text }]}>{spikeData.carbs}g</Text>
                  </View>
                )}
                {spikeData.fiber !== null && (
                  <View style={styles.spikeFactorRow}>
                    <Ionicons name="ellipse" size={6} color={spikeCfg.text + "99"} />
                    <Text style={[styles.spikeFactorLabel, { color: spikeCfg.text }]}>Fiber (net carb reducer)</Text>
                    <Text style={[styles.spikeFactorValue, { color: spikeCfg.text }]}>−{spikeData.fiber}g</Text>
                  </View>
                )}
                {spikeData.netCarbs !== null && spikeData.fiber !== null && (
                  <View style={[styles.spikeFactorRow, styles.spikeNetRow]}>
                    <Ionicons name="ellipse" size={6} color={spikeCfg.text + "99"} />
                    <Text style={[styles.spikeFactorLabel, { color: spikeCfg.text, fontFamily: "Inter_600SemiBold" }]}>Net carbs</Text>
                    <Text style={[styles.spikeFactorValue, { color: spikeCfg.text, fontFamily: "Inter_600SemiBold" }]}>{spikeData.netCarbs}g</Text>
                  </View>
                )}
                {spikeData.protein !== null && (
                  <View style={styles.spikeFactorRow}>
                    <Ionicons name="ellipse" size={6} color={spikeCfg.text + "99"} />
                    <Text style={[styles.spikeFactorLabel, { color: spikeCfg.text }]}>Protein listed</Text>
                    <Text style={[styles.spikeFactorValue, { color: spikeCfg.text }]}>{spikeData.protein}g</Text>
                  </View>
                )}
                {spikeData.glycemicLoad && (
                  <View style={styles.spikeFactorRow}>
                    <Ionicons name="ellipse" size={6} color={spikeCfg.text + "99"} />
                    <Text style={[styles.spikeFactorLabel, { color: spikeCfg.text }]}>Glycemic load</Text>
                    <Text style={[styles.spikeFactorValue, { color: spikeCfg.text, textTransform: "capitalize" }]}>{spikeData.glycemicLoad}</Text>
                  </View>
                )}
              </View>

              <Text style={[styles.spikeDisclaimer, { color: spikeCfg.text + "99" }]}>
                Estimate based on nutritional data · Individual responses vary
              </Text>
            </View>
          );
        })()}

        {orderSteps && orderSteps.length > 0 && (
          <View style={[styles.orderGuideCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Pressable
              style={styles.orderGuideHeader}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                trackEvent("order_guide_opened", { restaurantId: safeRestaurant.id, restaurantName: safeRestaurant.name, itemId: meal.id, itemName: meal.name });
                setShowOrderCard(true);
              }}
              testID="share-order-card-trigger"
            >
              <View style={styles.orderGuideIconWrap}>
                <Ionicons name="list-outline" size={16} color={Colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.orderGuideTitle, { color: c.textPrimary }]}>Ordering Guide</Text>
                <Text style={[styles.orderGuideSubtitle, { color: c.textMuted }]}>at {safeRestaurant.name}</Text>
              </View>
              <Text style={[styles.orderGuideProgress, { color: c.textMuted }]}>
                {checkedSteps.size}/{orderSteps.filter((s) => !s.skip).length} done
              </Text>
              <View style={[styles.copyBtn, { backgroundColor: Colors.brand.primary + "15" }]}>
                <Ionicons name="share-outline" size={14} color={Colors.brand.primary} />
                <Text style={[styles.copyBtnText, { color: Colors.brand.primary }]}>Share</Text>
              </View>
            </Pressable>

            <View style={styles.orderStepsList}>
              {orderSteps.map((step, index) => {
                const isChecked = checkedSteps.has(index);
                const isSkip = step.skip === true;
                return (
                  <Pressable
                    key={index}
                    onPress={() => toggleStep(index)}
                    style={[
                      styles.orderStep,
                      index < orderSteps.length - 1 && styles.orderStepBorder,
                      { borderColor: c.border },
                    ]}
                    testID={`order-step-${index}`}
                  >
                    <View style={[
                      styles.stepCheckbox,
                      {
                        backgroundColor: isChecked
                          ? (isSkip ? Colors.brand.avoid : Colors.brand.primary)
                          : "transparent",
                        borderColor: isChecked
                          ? (isSkip ? Colors.brand.avoid : Colors.brand.primary)
                          : isSkip ? Colors.brand.avoid + "80" : c.border,
                      },
                    ]}>
                      {isChecked ? (
                        <Ionicons name="checkmark" size={12} color="#fff" />
                      ) : isSkip ? (
                        <Ionicons name="close" size={12} color={Colors.brand.avoid} />
                      ) : null}
                    </View>
                    <View style={styles.stepContent}>
                      <Text style={[
                        styles.stepLabel,
                        { color: isSkip ? Colors.brand.avoidText : c.textMuted },
                      ]}>
                        {isSkip ? "Skip" : step.label}
                      </Text>
                      <Text style={[
                        styles.stepChoice,
                        {
                          color: isChecked ? c.textMuted : isSkip ? Colors.brand.avoidText : c.textPrimary,
                          textDecorationLine: isChecked ? "line-through" : "none",
                        },
                      ]}>
                        {step.choice}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </View>

          </View>
        )}

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setShowSimulator(true);
          }}
          style={({ pressed }) => [
            styles.simulatorBtn,
            {
              backgroundColor: c.cardBg,
              borderColor: Colors.brand.primary + "40",
              opacity: pressed ? 0.85 : 1,
            },
          ]}
          testID="open-simulator-btn"
        >
          <View style={[styles.simulatorIconWrap, { backgroundColor: "#dcfce7" }]}>
            <Ionicons name="pulse" size={18} color={Colors.brand.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.simulatorBtnTitle, { color: c.textPrimary }]}>
              Explore Meal Impact
            </Text>
            <Text style={[styles.simulatorBtnSub, { color: c.textMuted }]}>
              Customize ingredients · Compare food patterns
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
        </Pressable>

        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            router.push(`/compare?restaurantId=${restaurantId}&itemId=${itemId}`);
          }}
          style={({ pressed }) => [
            styles.compareBtn,
            { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.85 : 1 },
          ]}
          testID="compare-meals-btn"
        >
          <Ionicons name="git-compare-outline" size={15} color={c.textMuted} />
          <Text style={[styles.compareBtnText, { color: c.textSecondary }]}>Compare with another meal</Text>
          <Ionicons name="chevron-forward" size={14} color={c.textMuted} />
        </Pressable>

        <View style={styles.aiSection}>
          <View style={styles.aiHeader}>
            <View style={styles.aiIconWrap}>
              <Ionicons name="sparkles" size={16} color={Colors.brand.primary} />
            </View>
            <Text style={[styles.aiTitle, { color: c.textPrimary }]}>AI Diabetes Guidance</Text>
            {isPremium && !loading && (
              <Pressable onPress={fetchAnalysis} hitSlop={8}>
                <Ionicons name="refresh-outline" size={16} color={c.textMuted} />
              </Pressable>
            )}
          </View>

          {!isPremium && (
            <Pressable
              style={({ pressed }) => [styles.lockedCard, { backgroundColor: c.cardBg, borderColor: Colors.brand.primary + "40", opacity: pressed ? 0.85 : 1 }]}
              onPress={() => showPaywall("meal-analysis")}
            >
              <View style={[styles.lockIconWrap, { backgroundColor: Colors.brand.primary + "15" }]}>
                <Ionicons name="lock-closed" size={24} color={Colors.brand.primary} />
              </View>
              <Text style={[styles.lockedTitle, { color: c.textPrimary }]}>Full AI Analysis</Text>
              <Text style={[styles.lockedSubtitle, { color: c.textSecondary }]}>
                Get a complete breakdown: why this affects blood sugar, what to watch for, ordering tips, and better alternatives.
              </Text>
              <View style={[styles.lockedBtn, { backgroundColor: Colors.brand.primary }]}>
                <Ionicons name="shield-checkmark" size={14} color="#fff" />
                <Text style={styles.lockedBtnText}>Unlock with Premium</Text>
              </View>
            </Pressable>
          )}

          {isPremium && loading && (
            <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <ActivityIndicator color={Colors.brand.primary} size="small" />
              <Text style={[styles.loadingText, { color: c.textSecondary }]}>
                Analyzing with AI...
              </Text>
            </View>
          )}

          {isPremium && error && (
            <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.errorText, { color: c.textSecondary }]}>{error}</Text>
              <Pressable onPress={fetchAnalysis} style={styles.analysisRetryBtn}>
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          )}

          {isPremium && analysis && !loading && (
            <>
              <View style={[styles.headlineCard, { backgroundColor: scoreColors.bg, borderColor: Colors.brand.border }]}>
                <Text style={[styles.headline, { color: scoreColors.text }]}>{analysis.headline}</Text>
                <View style={styles.impactRow}>
                  <Ionicons name="pulse-outline" size={14} color={scoreColors.text} />
                  <Text style={[styles.impactText, { color: scoreColors.text }]}>
                    {" "}{analysis.bloodSugarImpact}
                  </Text>
                </View>
              </View>

              <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Text style={[styles.sectionHead, { color: c.textPrimary }]}>Why This May Matter</Text>
                <Text style={[styles.explanationText, { color: c.textSecondary }]}>
                  {analysis.glycemicExplanation}
                </Text>
              </View>
              <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <Text style={[styles.sectionHead, { color: c.textPrimary }]}>What This Analysis Used</Text>
                {analysis.informationUsed.map((item) => (
                  <Text key={item} style={[styles.explanationText, { color: c.textSecondary }]}>• {item}</Text>
                ))}
                <Text style={[styles.sourcesNote, { color: c.textMuted, marginTop: 10 }]}>{analysis.limitations}</Text>
                <Text style={[styles.sourcesNote, { color: c.textMuted, marginTop: 4 }]}>{analysis.verification}</Text>
              </View>

              {analysis.positives.length > 0 && (
                <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                  <Text style={[styles.sectionHead, { color: c.textPrimary }]}>Positives</Text>
                  {analysis.positives.map((p, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Ionicons name="checkmark-circle" size={16} color={Colors.brand.good} />
                      <Text style={[styles.bulletText, { color: c.textSecondary }]}>{p}</Text>
                    </View>
                  ))}
                </View>
              )}

              {analysis.concerns.length > 0 && (
                <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                  <Text style={[styles.sectionHead, { color: c.textPrimary }]}>Concerns</Text>
                  {analysis.concerns.map((concern, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Ionicons
                        name={meal.diabeticScore === "avoid" ? "close-circle" : "warning"}
                        size={16}
                        color={meal.diabeticScore === "avoid" ? Colors.brand.avoid : Colors.brand.caution}
                      />
                      <Text style={[styles.bulletText, { color: c.textSecondary }]}>{concern}</Text>
                    </View>
                  ))}
                </View>
              )}

              {analysis.orderingTips.length > 0 && (
                <View style={[styles.analysisCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                  <Text style={[styles.sectionHead, { color: c.textPrimary }]}>Ordering Tips</Text>
                  {analysis.orderingTips.map((tip, i) => (
                    <View key={i} style={styles.bulletRow}>
                      <Ionicons name="bulb-outline" size={16} color={Colors.brand.accent} />
                      <Text style={[styles.bulletText, { color: c.textSecondary }]}>{tip}</Text>
                    </View>
                  ))}
                </View>
              )}

              {analysis.betterAlternative && (
                <View style={[styles.alternativeCard, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good }]}>
                  <Ionicons name="swap-horizontal-outline" size={16} color={Colors.brand.goodText} />
                  <Text style={[styles.alternativeText, { color: Colors.brand.goodText }]}>
                    <Text style={{ fontFamily: "Inter_600SemiBold" }}>Better Option: </Text>
                    {analysis.betterAlternative}
                  </Text>
                </View>
              )}
            </>
          )}
        </View>

        <View style={[styles.sourcesCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Text style={[styles.sourcesTitle, { color: c.textMuted }]}>Data Sources & Methodology</Text>
          <Pressable
            style={styles.sourceRow}
            onPress={() => Linking.openURL("https://diabetesjournals.org/care/issue/47/Supplement_1")}
          >
            <Ionicons name="link-outline" size={13} color={Colors.brand.primary} />
            <Text style={[styles.sourceLink, { color: Colors.brand.primary }]}>
              American Diabetes Association — Standards of Care in Diabetes
            </Text>
          </Pressable>
          <Pressable
            style={styles.sourceRow}
            onPress={() => Linking.openURL("https://www.health.harvard.edu/diseases-and-conditions/glycemic-index-and-glycemic-load-for-100-foods")}
          >
            <Ionicons name="link-outline" size={13} color={Colors.brand.primary} />
            <Text style={[styles.sourceLink, { color: Colors.brand.primary }]}>
              Harvard Health — Glycemic Index and Glycemic Load Reference
            </Text>
          </Pressable>
          <Text style={[styles.sourcesNote, { color: c.textMuted }]}>
            Meal pattern labels use listed nutrition and ingredients for general education. They are not glucose predictions or medical advice; portions and individual responses vary.
          </Text>
        </View>
      </ScrollView>

      {orderSteps && meal && (
        <ShareOrderCard
          visible={showOrderCard}
          onClose={() => setShowOrderCard(false)}
          restaurantName={safeRestaurant.name}
          mealName={meal.name}
          diabeticScore={meal.diabeticScore as "good" | "caution" | "avoid"}
          orderSteps={orderSteps}
        />
      )}

      {meal && (
        <SimulatorModal
          visible={showSimulator}
          onClose={() => setShowSimulator(false)}
          restaurantName={safeRestaurant.name}
          restaurantCuisine={safeRestaurant.cuisine}
          mealName={meal.name}
          mealDescription={meal.description}
          mealNutrients={meal.nutrients}
          mealCarbRange={meal.carbRange}
          orderSteps={orderSteps ?? undefined}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  headerGradient: { paddingHorizontal: 20, paddingBottom: 24 },
  navRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10 },
  navBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.15)", alignItems: "center", justifyContent: "center" },
  navRight: { flexDirection: "row", gap: 8 },
  mealName: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff", marginTop: 8, marginBottom: 6 },
  restaurantLabel: { fontFamily: "Inter_400Regular", fontSize: 14, color: "rgba(255,255,255,0.7)", marginBottom: 8 },
  directionsBtn: { flexDirection: "row", alignItems: "center", gap: 5, alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.12)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, marginBottom: 14 },
  directionsBtnText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.85)" },
  scoreRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  carbBadge: { flexDirection: "row", alignItems: "center", backgroundColor: "rgba(255,255,255,0.15)", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 10 },
  carbText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.9)" },
  glBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: "rgba(255,255,255,0.2)" },
  glText: { fontFamily: "Inter_700Bold", fontSize: 10, color: "#fff" },
  giInfoRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 12, opacity: 0.8 },
  giInfoText: { fontFamily: "Inter_400Regular", fontSize: 11, color: "rgba(255,255,255,0.7)", flex: 1 },
  logButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.2)",
  },
  logButtonText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  confidenceRow: {
    flexDirection: "row" as const,
    flexWrap: "wrap" as const,
    alignItems: "center",
    gap: 8,
    marginTop: 12,
  },
  confidenceBadge: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 6,
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
  },
  confidenceCount: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: "#fff",
  },
  communityPick: {
    flexDirection: "row" as const,
    alignItems: "center",
    gap: 4,
    backgroundColor: Colors.brand.goodLight,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  communityPickText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: Colors.brand.goodText,
  },
  content: { flex: 1 },
  contentContainer: { padding: 16, gap: 12, maxWidth: 700, alignSelf: "center" as const, width: "100%" },
  desc: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  nutrientGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  nutrientCard: { flex: 1, minWidth: "30%", borderRadius: 10, borderWidth: 1, padding: 10, alignItems: "center" },
  nutrientValue: { fontFamily: "Inter_700Bold", fontSize: 18 },
  nutrientLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 2 },
  spikeCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  spikeHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
  spikeTitleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  spikeSectionLabel: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.8 },
  spikeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  spikeBadgeText: { fontFamily: "Inter_700Bold", fontSize: 10, letterSpacing: 0.6 },
  spikeRiseRow: { flexDirection: "row", alignItems: "baseline" },
  spikeRiseNumber: { fontFamily: "Inter_700Bold", fontSize: 38 },
  spikeRiseUnit: { fontFamily: "Inter_400Regular", fontSize: 13 },
  spikeFactorList: { borderTopWidth: 1, paddingTop: 10, gap: 7 },
  spikeFactorRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  spikeNetRow: { marginTop: 2 },
  spikeFactorLabel: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  spikeFactorValue: { fontFamily: "Inter_500Medium", fontSize: 13 },
  spikeDisclaimer: { fontFamily: "Inter_400Regular", fontSize: 11, fontStyle: "italic" },
  aiSection: { gap: 10 },
  aiHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 2 },
  aiIconWrap: { width: 30, height: 30, borderRadius: 8, backgroundColor: Colors.brand.goodLight, alignItems: "center", justifyContent: "center" },
  aiTitle: { flex: 1, fontFamily: "Inter_700Bold", fontSize: 16 },
  analysisCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 10 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  analysisRetryBtn: { paddingHorizontal: 20, paddingVertical: 8, backgroundColor: Colors.brand.primary, borderRadius: 8, alignSelf: "center" as const },
  retryText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  headlineCard: { borderRadius: 14, padding: 14, gap: 8, borderWidth: 1 },
  headline: { fontFamily: "Inter_700Bold", fontSize: 15, lineHeight: 22 },
  impactRow: { flexDirection: "row", alignItems: "center" },
  impactText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sectionHead: { fontFamily: "Inter_700Bold", fontSize: 14 },
  explanationText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21 },
  bulletRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  bulletText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  alternativeCard: { borderRadius: 12, borderWidth: 1, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  alternativeText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  lockedCard: { borderRadius: 16, borderWidth: 1.5, borderStyle: "dashed", padding: 20, alignItems: "center", gap: 10 },
  lockIconWrap: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center", marginBottom: 4 },
  lockedTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  lockedSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, textAlign: "center" },
  lockedBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, marginTop: 4 },
  lockedBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  notFound: { fontFamily: "Inter_600SemiBold", fontSize: 18, textAlign: "center" },
  notFoundSub: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", paddingHorizontal: 32 },
  retryBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 12, marginTop: 4 },
  retryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  compareBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  compareBtnText: { fontFamily: "Inter_500Medium", fontSize: 13, flex: 1 },
  simulatorBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 12,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
  },
  simulatorIconWrap: {
    width: 40, height: 40, borderRadius: 10,
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  simulatorBtnTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  simulatorBtnSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  orderGuideCard: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
  orderGuideHeader: { flexDirection: "row" as const, alignItems: "center", gap: 8, padding: 14, paddingBottom: 12 },
  orderGuideIconWrap: { width: 28, height: 28, borderRadius: 8, backgroundColor: "#dcfce7", alignItems: "center" as const, justifyContent: "center" as const },
  orderGuideTitle: { fontFamily: "Inter_700Bold", fontSize: 15 },
  orderGuideSubtitle: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 1 },
  orderGuideProgress: { fontFamily: "Inter_400Regular", fontSize: 12 },
  copyBtn: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 },
  copyBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  orderStepsList: { paddingHorizontal: 14, paddingBottom: 4 },
  orderStep: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, paddingVertical: 12 },
  sourcesCard: { borderRadius: 12, borderWidth: 1, padding: 12, gap: 8 },
  sourcesTitle: { fontFamily: "Inter_600SemiBold", fontSize: 11, letterSpacing: 0.5, textTransform: "uppercase" as const, marginBottom: 2 },
  sourceRow: { flexDirection: "row" as const, alignItems: "flex-start" as const, gap: 6 },
  sourceLink: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17, flex: 1, textDecorationLine: "underline" as const },
  sourcesNote: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 4, fontStyle: "italic" as const },
  orderStepBorder: { borderBottomWidth: 1 },
  stepCheckbox: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, alignItems: "center" as const, justifyContent: "center" as const, flexShrink: 0 },
  stepContent: { flex: 1 },
  stepLabel: { fontFamily: "Inter_400Regular", fontSize: 11, marginBottom: 2 },
  stepChoice: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 19 },
});
