import React from "react";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";

import Colors from "@/constants/colors";

export default function ScanHubScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const topPad = Platform.OS === "web" ? 67 : insets.top + 10;
  const bottomPad = Platform.OS === "web" ? 106 : insets.bottom + 84;

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.heading}>
          <Text style={[styles.title, { color: c.textPrimary }]}>Scan</Text>
          <Text style={[styles.subtitle, { color: c.textPrimary }]}>
            Choose what you&apos;d like to check.
          </Text>
          <Text style={[styles.trustLine, { color: c.textSecondary }]}>
            Verified when possible • Estimates clearly labeled
          </Text>
        </View>

        <Pressable
          onPress={() => router.push("/(tabs)/scan")}
          style={({ pressed }) => [
            styles.choice,
            { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Scan a Restaurant Menu"
          accessibilityHint="Open the restaurant menu scanner"
        >
          <View style={[styles.choiceIcon, { backgroundColor: Colors.brand.primary }]}>
            <Ionicons name="restaurant-outline" size={26} color="#fff" />
          </View>
          <View style={styles.choiceCopy}>
            <Text style={[styles.modeLabel, { color: Colors.brand.primary }]}>SMART DINING</Text>
            <Text style={[styles.choiceTitle, { color: c.textPrimary }]}>
              Scan a Restaurant Menu
            </Text>
            <Text style={[styles.choiceSubtitle, { color: c.textPrimary }]}>
              Review menu items with diabetes-conscious context based on the information we can identify.
            </Text>
            <Text style={[styles.methodNote, { color: c.textSecondary }]}>
              Estimates are labeled, and missing information stays unknown.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={21} color={Colors.brand.primary} />
        </Pressable>

        <Pressable
          onPress={() => router.push("/(tabs)/biotrace")}
          style={({ pressed }) => [
            styles.choice,
            { backgroundColor: c.cardBg, borderColor: c.border, opacity: pressed ? 0.88 : 1 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Scan a Packaged Product with BioTrace"
          accessibilityHint="Open the BioTrace product scanner"
        >
          <View style={[styles.choiceIcon, { backgroundColor: "#236B45" }]}>
            <Ionicons name="barcode-outline" size={26} color="#fff" />
          </View>
          <View style={styles.choiceCopy}>
            <Text style={[styles.modeLabel, { color: "#236B45" }]}>BIOTRACE</Text>
            <Text style={[styles.choiceTitle, { color: c.textPrimary }]}>
              Scan a Packaged Product
            </Text>
            <Text style={[styles.choiceSubtitle, { color: c.textPrimary }]}>
              Check nutrition, ingredients, processing, and source transparency.
            </Text>
            <Text style={[styles.methodNote, { color: c.textSecondary }]}>
              Verified when source data supports it; unknowns stay unknown.
            </Text>
          </View>
          <Ionicons name="arrow-forward" size={21} color={Colors.brand.primary} />
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 14 },
  heading: { marginBottom: 6 },
  title: { fontSize: 29, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 14, fontFamily: "Inter_500Medium", lineHeight: 21, marginTop: 5 },
  trustLine: { fontSize: 12, fontFamily: "Inter_500Medium", lineHeight: 18, marginTop: 4 },
  choice: {
    minHeight: 126,
    borderWidth: 1,
    borderRadius: 18,
    padding: 17,
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
  },
  choiceIcon: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  choiceCopy: { flex: 1 },
  modeLabel: { fontFamily: "Inter_700Bold", fontSize: 10, lineHeight: 14, letterSpacing: 0.7, marginBottom: 3 },
  choiceTitle: { fontFamily: "Inter_700Bold", fontSize: 16, lineHeight: 21 },
  choiceSubtitle: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 19, marginTop: 5 },
  methodNote: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 5 },
});