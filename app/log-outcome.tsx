import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ScrollView,
  Platform,
  useColorScheme,
  KeyboardAvoidingView,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import type { BloodSugarOutcome } from "@/context/AppContext";

const OUTCOMES: {
  id: BloodSugarOutcome;
  label: string;
  emoji: string;
  description: string;
  color: string;
  bg: string;
}[] = [
  {
    id: "good",
    label: "Stable",
    emoji: "✅",
    description: "Blood sugar stayed in range",
    color: "#166534",
    bg: "#dcfce7",
  },
  {
    id: "slight_spike",
    label: "Slight spike",
    emoji: "⚡",
    description: "A little higher than normal",
    color: "#92400e",
    bg: "#fef3c7",
  },
  {
    id: "high_spike",
    label: "High spike",
    emoji: "🔴",
    description: "Significantly elevated reading",
    color: "#991b1b",
    bg: "#fee2e2",
  },
  {
    id: "not_measured",
    label: "Did not measure",
    emoji: "📋",
    description: "I didn't check this time",
    color: "#4b5563",
    bg: "#f3f4f6",
  },
];

export default function LogOutcomeScreen() {
  const { logId, mealName } = useLocalSearchParams<{ logId: string; mealName: string }>();
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const { updateMealOutcome } = useApp();

  const [selected, setSelected] = useState<BloodSugarOutcome | null>(null);
  const [glucoseBefore, setGlucoseBefore] = useState("");
  const [glucoseAfter, setGlucoseAfter] = useState("");

  const handleSave = () => {
    if (!selected || !logId) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    updateMealOutcome(
      logId,
      selected,
      glucoseBefore ? parseFloat(glucoseBefore) : undefined,
      glucoseAfter ? parseFloat(glucoseAfter) : undefined,
    );
    router.back();
  };

  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: c.cardBg }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.handle} />

        <Text style={[styles.title, { color: c.textPrimary }]}>How did it go?</Text>
        <Text style={[styles.subtitle, { color: c.textSecondary }]} numberOfLines={2}>
          {mealName}
        </Text>

        <View style={styles.options}>
          {OUTCOMES.map((o) => {
            const isSelected = selected === o.id;
            return (
              <Pressable
                key={o.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setSelected(o.id);
                }}
                style={[
                  styles.option,
                  {
                    backgroundColor: isSelected ? o.bg : c.background,
                    borderColor: isSelected ? o.color : c.border,
                    borderWidth: isSelected ? 2 : 1,
                  },
                ]}
                testID={`outcome-${o.id}`}
              >
                <Text style={styles.emoji}>{o.emoji}</Text>
                <View style={styles.optionText}>
                  <Text style={[styles.optionLabel, { color: isSelected ? o.color : c.textPrimary }]}>
                    {o.label}
                  </Text>
                  <Text style={[styles.optionDesc, { color: c.textSecondary }]}>{o.description}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={22} color={o.color} />
                )}
              </Pressable>
            );
          })}
        </View>

        {selected && selected !== "not_measured" && (
          <View style={[styles.glucoseSection, { borderColor: c.border }]}>
            <Text style={[styles.glucoseTitle, { color: c.textPrimary }]}>
              Glucose readings <Text style={[styles.optional, { color: c.textMuted }]}>(optional)</Text>
            </Text>
            <View style={styles.glucoseRow}>
              <View style={styles.glucoseField}>
                <Text style={[styles.glucoseLabel, { color: c.textSecondary }]}>Before meal</Text>
                <View style={[styles.glucoseInput, { backgroundColor: c.background, borderColor: c.border }]}>
                  <TextInput
                    value={glucoseBefore}
                    onChangeText={setGlucoseBefore}
                    placeholder="e.g. 95"
                    placeholderTextColor={c.textMuted}
                    keyboardType="numeric"
                    style={[styles.glucoseInputText, { color: c.textPrimary }]}
                    testID="glucose-before"
                  />
                  <Text style={[styles.unit, { color: c.textMuted }]}>mg/dL</Text>
                </View>
              </View>
              <View style={styles.glucoseField}>
                <Text style={[styles.glucoseLabel, { color: c.textSecondary }]}>After meal</Text>
                <View style={[styles.glucoseInput, { backgroundColor: c.background, borderColor: c.border }]}>
                  <TextInput
                    value={glucoseAfter}
                    onChangeText={setGlucoseAfter}
                    placeholder="e.g. 145"
                    placeholderTextColor={c.textMuted}
                    keyboardType="numeric"
                    style={[styles.glucoseInputText, { color: c.textPrimary }]}
                    testID="glucose-after"
                  />
                  <Text style={[styles.unit, { color: c.textMuted }]}>mg/dL</Text>
                </View>
              </View>
            </View>
          </View>
        )}

        <Pressable
          onPress={handleSave}
          disabled={!selected}
          style={[
            styles.saveBtn,
            { backgroundColor: selected ? Colors.brand.primary : c.border },
          ]}
          testID="save-outcome"
        >
          <Text style={[styles.saveBtnText, { color: selected ? "#fff" : c.textMuted }]}>
            Save Outcome
          </Text>
        </Pressable>

        <Pressable onPress={() => router.back()} style={styles.skipBtn}>
          <Text style={[styles.skipText, { color: c.textMuted }]}>Skip for now</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 20, paddingTop: 8 },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#d1d5db",
    alignSelf: "center",
    marginBottom: 20,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    marginBottom: 4,
  },
  subtitle: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    marginBottom: 24,
  },
  options: { gap: 10, marginBottom: 24 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    borderRadius: 14,
    padding: 16,
  },
  emoji: { fontSize: 24, width: 32, textAlign: "center" },
  optionText: { flex: 1 },
  optionLabel: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 2 },
  optionDesc: { fontFamily: "Inter_400Regular", fontSize: 12 },
  glucoseSection: {
    borderTopWidth: 1,
    paddingTop: 20,
    marginBottom: 24,
  },
  glucoseTitle: { fontFamily: "Inter_600SemiBold", fontSize: 15, marginBottom: 14 },
  optional: { fontFamily: "Inter_400Regular", fontSize: 13 },
  glucoseRow: { flexDirection: "row", gap: 12 },
  glucoseField: { flex: 1 },
  glucoseLabel: { fontFamily: "Inter_400Regular", fontSize: 12, marginBottom: 6 },
  glucoseInput: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 44,
  },
  glucoseInputText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 15,
  },
  unit: { fontFamily: "Inter_400Regular", fontSize: 12 },
  saveBtn: {
    height: 52,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  saveBtnText: { fontFamily: "Inter_700Bold", fontSize: 16 },
  skipBtn: { alignItems: "center", paddingVertical: 8 },
  skipText: { fontFamily: "Inter_400Regular", fontSize: 14 },
});
