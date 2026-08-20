import React from "react";
import { View, Text, StyleSheet, Pressable, useColorScheme, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Colors from "@/constants/colors";
import type { Restaurant } from "@/data/restaurants";

interface Props {
  restaurant: Restaurant;
  onPress: () => void;
  saved?: boolean;
  onToggleSave?: () => void;
}

export function RestaurantCard({ restaurant, onPress, saved, onToggleSave }: Props) {
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const goodCount = restaurant.menuItems.filter((m) => m.diabeticScore === "good").length;
  const total = restaurant.menuItems.length;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.92 : 1 },
      ]}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="restaurant" size={22} color={Colors.brand.primary} />
        </View>
        <View style={styles.info}>
          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: c.textPrimary }]} numberOfLines={1}>
              {restaurant.name}
            </Text>
            {restaurant.dietitianReviewed && (
              <Ionicons name="checkmark-circle" size={16} color={Colors.brand.primary} style={styles.dietitianBadge} />
            )}
          </View>
          <Text style={[styles.cuisine, { color: c.textSecondary }]}>
            {restaurant.cuisine} · {restaurant.priceLevel}
          </Text>
        </View>
        {onToggleSave && (
          <Pressable onPress={onToggleSave} hitSlop={12} style={styles.saveBtn}>
            <Ionicons
              name={saved ? "heart" : "heart-outline"}
              size={20}
              color={saved ? Colors.brand.avoid : c.textMuted}
            />
          </Pressable>
        )}
      </View>

      <View style={styles.meta}>
        <View style={styles.metaItem}>
          <Ionicons name="star" size={13} color={Colors.brand.accent} />
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            {" "}{restaurant.rating} ({restaurant.reviewCount})
          </Text>
        </View>
        <View style={styles.dot} />
        <View style={styles.metaItem}>
          <Ionicons name="location-outline" size={13} color={c.textMuted} />
          <Text style={[styles.metaText, { color: c.textSecondary }]}>
            {" "}{restaurant.distance}
          </Text>
        </View>
        <View style={styles.dot} />
        <View
          style={[
            styles.badge,
            {
              backgroundColor: goodCount / total >= 0.5 ? Colors.brand.goodLight : Colors.brand.cautionLight,
            },
          ]}
        >
          <Text
            style={[
              styles.badgeText,
              {
                color: goodCount / total >= 0.5 ? Colors.brand.goodText : Colors.brand.cautionText,
              },
            ]}
          >
            {goodCount} of {total} safe
          </Text>
        </View>
      </View>

      {restaurant.tags.length > 0 && (
        <View style={styles.tags}>
          {restaurant.tags.slice(0, 2).map((tag) => (
            <View key={tag} style={[styles.tag, { borderColor: c.border }]}>
              <Text style={[styles.tagText, { color: c.textSecondary }]}>{tag}</Text>
            </View>
          ))}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    ...Platform.select({
      web: { boxShadow: "0px 2px 8px rgba(0,0,0,0.06)" } as any,
      default: {
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 8,
        elevation: 2,
      },
    }),
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: Colors.brand.goodLight,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  info: {
    flex: 1,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    marginBottom: 2,
  },
  name: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  dietitianBadge: {
    marginTop: -2,
  },
  cuisine: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
  },
  saveBtn: {
    padding: 4,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 10,
  },
  metaItem: {
    flexDirection: "row",
    alignItems: "center",
  },
  metaText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 2,
    backgroundColor: "#C4D5CA",
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  badgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
  },
  tags: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  tagText: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
});
