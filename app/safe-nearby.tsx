import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  useColorScheme,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { RESTAURANTS } from "@/data/restaurants";
import type { DiabeticScore } from "@/data/restaurants";

interface SafeMealResult {
  restaurantId: string;
  restaurantName: string;
  itemId: string;
  mealName: string;
  mealDescription: string;
  diabeticScore: DiabeticScore;
  carbRange: string;
  quickTip: string;
  distance: number;
  distanceLabel: string;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function kmToMiles(km: number): number {
  return km * 0.621371;
}

const GPS_MATCH_THRESHOLD_MI = 50;

function buildResults(userLat: number | null, userLng: number | null): SafeMealResult[] {
  const results: SafeMealResult[] = [];

  const useGps = userLat !== null && userLng !== null;

  const gpsDistances = useGps
    ? RESTAURANTS.map((r) => kmToMiles(haversineKm(userLat!, userLng!, r.lat, r.lng)))
    : null;

  const anyWithinThreshold =
    gpsDistances !== null && gpsDistances.some((d) => d <= GPS_MATCH_THRESHOLD_MI);

  for (let i = 0; i < RESTAURANTS.length; i++) {
    const restaurant = RESTAURANTS[i];
    const staticDist = parseFloat(restaurant.distance) || 1.0;

    let distMi: number;
    let distanceLabel: string;

    if (useGps && anyWithinThreshold && gpsDistances !== null) {
      distMi = gpsDistances[i];
      distanceLabel = `${distMi.toFixed(1)} mi`;
    } else {
      distMi = staticDist;
      distanceLabel = restaurant.distance || `${staticDist.toFixed(1)} mi`;
    }

    const goodItems = restaurant.menuItems.filter((m) => m.diabeticScore === "good");
    for (const item of goodItems) {
      results.push({
        restaurantId: restaurant.id,
        restaurantName: restaurant.name,
        itemId: item.id,
        mealName: item.name,
        mealDescription: item.description,
        diabeticScore: item.diabeticScore,
        carbRange: item.carbRange,
        quickTip: item.quickTip,
        distance: distMi,
        distanceLabel,
      });
    }
  }

  return results.sort((a, b) => a.distance - b.distance).slice(0, 12);
}


interface ResultCardProps {
  item: SafeMealResult;
  isDark: boolean;
}

function ResultCard({ item, isDark }: ResultCardProps) {
  const c = isDark ? Colors.dark : Colors.light;

  const handleView = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    router.dismiss();
    setTimeout(() => router.push(`/meal/${item.restaurantId}/${item.itemId}`), 50);
  };

  return (
    <Pressable
      onPress={handleView}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.95 : 1 },
      ]}
      testID={`safe-meal-card-${item.itemId}`}
    >
      <View style={styles.cardHeader}>
        <View style={styles.restaurantBadge}>
          <Ionicons name="storefront-outline" size={11} color={Colors.brand.primary} />
          <Text style={[styles.restaurantName, { color: Colors.brand.primary }]}>
            {item.restaurantName}
          </Text>
        </View>
        <View style={styles.distanceBadge}>
          <Ionicons name="location-outline" size={11} color={c.textMuted} />
          <Text style={[styles.distanceText, { color: c.textMuted }]}>{item.distanceLabel}</Text>
        </View>
      </View>

      <Text style={[styles.mealName, { color: c.textPrimary }]}>{item.mealName}</Text>
      <Text style={[styles.mealDesc, { color: c.textSecondary }]} numberOfLines={2}>
        {item.mealDescription}
      </Text>

      <View style={styles.carbRow}>
        <Ionicons name="nutrition-outline" size={12} color={c.textMuted} />
        <Text style={[styles.carbText, { color: c.textMuted }]}>{item.carbRange}</Text>
      </View>

      <View style={styles.cardFooter}>
        <View style={styles.impactBadge}>
          <View style={styles.impactDot} />
          <Text style={styles.impactLabel}>LOW IMPACT</Text>
        </View>
        <View style={styles.viewHint}>
          <Text style={[styles.viewHintText, { color: Colors.brand.primary }]}>Tap to view details</Text>
          <Ionicons name="chevron-forward" size={12} color={Colors.brand.primary} />
        </View>
      </View>
    </Pressable>
  );
}

export default function SafeNearbyScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [loading, setLoading] = useState(true);
  const [locationLabel, setLocationLabel] = useState("your location");
  const [results, setResults] = useState<SafeMealResult[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (Platform.OS !== "web") {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          const geocode = await Location.reverseGeocodeAsync({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          });
          const place = geocode[0];
          if (place) setLocationLabel(place.district || place.city || "your area");
          setResults(buildResults(loc.coords.latitude, loc.coords.longitude));
          return;
        }
      }
      setResults(buildResults(null, null));
    } catch {
      setResults(buildResults(null, null));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: topPad + 8 }]}>
        <View style={styles.headerInner}>
          <View style={styles.iconWrap}>
            <Ionicons name="leaf" size={18} color={Colors.brand.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerTitle, { color: c.textPrimary }]}>Safe Meals Near You</Text>
            <Text style={[styles.headerSub, { color: c.textMuted }]}>
              Low blood sugar impact · Curated safe meals
            </Text>
          </View>
          <Pressable onPress={() => router.back()} hitSlop={10} testID="close-safe-nearby">
            <Ionicons name="close" size={22} color={c.textMuted} />
          </Pressable>
        </View>

        {!loading && (
          <View style={[styles.locationBar, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Ionicons name="location" size={13} color={Colors.brand.primary} />
            <Text style={[styles.locationBarText, { color: c.textSecondary }]}>
              Showing options near {locationLabel}
            </Text>
          </View>
        )}
      </View>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={[styles.loadingText, { color: c.textMuted }]}>Finding safe meals…</Text>
        </View>
      ) : results.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Ionicons name="leaf-outline" size={48} color={c.border} />
          <Text style={[styles.emptyTitle, { color: c.textPrimary }]}>No results found</Text>
          <Text style={[styles.emptySubtitle, { color: c.textMuted }]}>
            Try browsing all restaurants to find something that works for you.
          </Text>
          <Pressable onPress={() => router.back()} style={[styles.browseBtn, { backgroundColor: Colors.brand.primary }]}>
            <Text style={styles.browseBtnText}>Browse Restaurants</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={results}
          keyExtractor={(item) => `${item.restaurantId}-${item.itemId}`}
          renderItem={({ item }) => <ResultCard item={item} isDark={isDark} />}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <Text style={[styles.resultCount, { color: c.textMuted }]}>
              {results.length} safe option{results.length !== 1 ? "s" : ""} found
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 0 },
  headerInner: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 10 },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#dcfce7",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 18 },
  headerSub: { fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 1 },
  locationBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  locationBarText: { fontFamily: "Inter_400Regular", fontSize: 13, flex: 1 },
  loadingWrap: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14 },
  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, gap: 8 },
  emptyTitle: { fontFamily: "Inter_700Bold", fontSize: 18, marginTop: 8 },
  emptySubtitle: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  browseBtn: { marginTop: 8, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10 },
  browseBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 14, color: "#fff" },
  list: { paddingTop: 8, paddingHorizontal: 16, gap: 12 },
  resultCount: { fontFamily: "Inter_400Regular", fontSize: 12, paddingBottom: 4 },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    gap: 6,
  },
  cardHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  restaurantBadge: { flexDirection: "row", alignItems: "center", gap: 4 },
  restaurantName: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  distanceBadge: { flexDirection: "row", alignItems: "center", gap: 3 },
  distanceText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  mealName: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 22 },
  mealDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  carbRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  carbText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4,
  },
  impactBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: "#dcfce7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  impactDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#16a34a" },
  impactLabel: {
    fontFamily: "Inter_700Bold",
    fontSize: 10,
    color: "#15803d",
    letterSpacing: 0.5,
  },
  viewHint: { flexDirection: "row", alignItems: "center", gap: 3 },
  viewHintText: { fontFamily: "Inter_500Medium", fontSize: 12 },
});
