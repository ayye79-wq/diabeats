import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { BioTraceResult } from "@/components/BioTraceResult";
import { apiRequest } from "@/lib/query-client";
import { readableBioTraceError } from "@/lib/biotrace-errors";
import { isValidBarcode, type NormalizedProduct } from "@/shared/biotrace";
import {
  computeBioTraceRating,
  getBioTraceProfileHeaders,
  type BioTraceProfile,
  type BioTraceRating,
} from "@/shared/biotrace-rating";
import type { IngredientAnalysis } from "@/shared/biotrace-ingredients";
import { useApp } from "@/context/AppContext";

type Result = { product: NormalizedProduct; rating: BioTraceRating; ingredientAnalysis: IngredientAnalysis };
type Alternative = Result;

export default function BioTraceProductScreen() {
  const { barcode: rawBarcode } = useLocalSearchParams<{ barcode?: string | string[] }>();
  const barcode = Array.isArray(rawBarcode) ? rawBarcode[0] : rawBarcode;
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const [result, setResult] = useState<Result | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportValue, setReportValue] = useState("");
  const { diabetesType, dietGoal, dailyCarbTarget, usesInsulin } = useApp();
  const bioTraceProfile = useMemo<BioTraceProfile>(
    () => ({ diabetesType, dietGoal, dailyCarbTarget, usesInsulin }),
    [dailyCarbTarget, diabetesType, dietGoal, usesInsulin],
  );
  const bioTraceProfileRef = React.useRef(bioTraceProfile);
  const personalizeResult = useCallback(
    (next: Result): Result => ({
      ...next,
      rating: computeBioTraceRating(next.product, bioTraceProfileRef.current),
    }),
    [],
  );

  useEffect(() => {
    bioTraceProfileRef.current = bioTraceProfile;
    setResult((current) => (current ? personalizeResult(current) : current));
    setAlternatives((current) => current.map(personalizeResult));
  }, [bioTraceProfile, personalizeResult]);

  const loadProduct = useCallback(async () => {
    if (!isValidBarcode(barcode)) {
      setError("This BioTrace link does not include a valid barcode.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(
        "GET",
        `/api/biotrace/product/${barcode}`,
        undefined,
        getBioTraceProfileHeaders(bioTraceProfileRef.current),
      );
      setResult(personalizeResult((await response.json()) as Result));
    } catch (err) {
      setError(readableBioTraceError(err, "Could not load this verified product."));
    } finally {
      setLoading(false);
    }
  }, [barcode, personalizeResult]);

  useEffect(() => {
    void loadProduct();
  }, [loadProduct]);

  const saveFood = useCallback(async () => {
    if (!result?.product.barcode) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/biotrace/saved", {
        barcode: result.product.barcode,
        source: "barcode",
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(readableBioTraceError(err, "Could not save this product."));
    } finally {
      setLoading(false);
    }
  }, [result]);

  const loadAlternatives = useCallback(async () => {
    if (!result?.product.barcode) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiRequest(
        "GET",
        `/api/biotrace/alternatives/${result.product.barcode}?limit=5`,
        undefined,
        getBioTraceProfileHeaders(bioTraceProfileRef.current),
      );
      const data = (await response.json()) as { alternatives?: Alternative[] };
      setAlternatives((data.alternatives ?? []).map(personalizeResult));
      if (!(data.alternatives ?? []).length) setError("No clearly better alternatives were found in the public product data.");
    } catch (err) {
      setError(readableBioTraceError(err, "Could not load alternatives."));
    } finally {
      setLoading(false);
    }
  }, [personalizeResult, result]);

  const submitReport = useCallback(async () => {
    if (!result || !reportValue.trim()) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/biotrace/corrections", {
        barcode: result.product.barcode,
        productName: result.product.name,
        field: "product-data",
        reportedValue: reportValue.trim(),
        details: "Submitted from BioTrace product detail.",
      });
      setShowReport(false);
      setReportValue("");
      Alert.alert("Report sent", "Thanks. We recorded the issue without storing a label photo.");
    } catch (err) {
      setError(readableBioTraceError(err, "Could not send this report."));
    } finally {
      setLoading(false);
    }
  }, [reportValue, result]);

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + 10, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Go back">
          <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
          <Text style={[styles.backText, { color: c.textPrimary }]}>Back</Text>
        </Pressable>
        <Text style={[styles.headerTitle, { color: c.textPrimary }]}>BioTrace</Text>
        <View style={{ width: 54 }} />
      </View>

      {loading && !result ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={[styles.loadingText, { color: c.textSecondary }]}>Reloading verified package-label data…</Text>
        </View>
      ) : !result ? (
        <View style={styles.errorState}>
          <Ionicons name="alert-circle-outline" size={46} color={Colors.brand.avoid} />
          <Text style={[styles.errorTitle, { color: c.textPrimary }]}>Couldn’t load this product</Text>
          <Text style={[styles.errorText, { color: c.textSecondary }]}>{error ?? "Try again or scan the package barcode."}</Text>
          <Pressable onPress={() => void loadProduct()} style={styles.retryButton} accessibilityRole="button" accessibilityLabel="Retry verified product lookup">
            <Text style={styles.retryText}>Try again</Text>
          </Pressable>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 28 }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.verifiedNotice, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good }]}>
            <Ionicons name="shield-checkmark-outline" size={17} color={Colors.brand.primary} />
            <Text style={[styles.verifiedCopy, { color: Colors.brand.primaryDark }]}>
              Reloaded from verified public package-label data. This is separate from restaurant and menu comparisons.
            </Text>
          </View>
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          <BioTraceResult
            product={result.product}
            rating={result.rating}
            ingredientAnalysis={result.ingredientAnalysis}
            dark={isDark}
            saved={saved}
            onSave={() => void saveFood()}
            onAlternatives={() => void loadAlternatives()}
            onReport={() => setShowReport(true)}
            onAskAssistant={() =>
              router.push({
                pathname: "/(tabs)/chat" as any,
                params: { biotraceBarcode: result.product.barcode ?? "", biotraceProductName: result.product.name },
              })
            }
          />
          {loading ? <ActivityIndicator color={Colors.brand.primary} style={{ marginVertical: 8 }} /> : null}
          {alternatives.length ? (
            <View style={[styles.alternativeCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>Better alternatives</Text>
              <Text style={[styles.sectionCopy, { color: c.textSecondary }]}>Ranked with the same transparent rules from comparable public listings.</Text>
              {alternatives.map((alternative) => (
                <Pressable
                  key={`${alternative.product.barcode}-${alternative.product.name}`}
                  onPress={() => {
                    setResult(alternative);
                    setSaved(false);
                    setAlternatives([]);
                  }}
                  style={[styles.alternativeRow, { borderTopColor: c.border }]}
                  accessibilityRole="button"
                  accessibilityLabel={`View ${alternative.product.name}, ${alternative.rating.display}`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.alternativeName, { color: c.textPrimary }]} numberOfLines={1}>{alternative.product.name}</Text>
                    <Text style={[styles.alternativeBrand, { color: c.textSecondary }]}>{alternative.product.brand ?? "Brand not listed"}</Text>
                  </View>
                  <Text style={styles.alternativeRating}>{alternative.rating.display}</Text>
                  <Ionicons name="chevron-forward" size={17} color={c.textMuted} />
                </Pressable>
              ))}
            </View>
          ) : null}
          {showReport ? (
            <View style={[styles.reportBox, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.sectionTitle, { color: c.textPrimary }]}>What looks incorrect?</Text>
              <TextInput value={reportValue} onChangeText={setReportValue} placeholder="Example: ingredients changed on my package" placeholderTextColor={c.textMuted} style={[styles.reportInput, { borderColor: c.border, color: c.textPrimary }]} multiline accessibilityLabel="Describe incorrect product information" />
              <View style={styles.reportActions}>
                <Pressable onPress={() => setShowReport(false)} style={styles.cancelButton}><Text style={[styles.cancelText, { color: c.textSecondary }]}>Cancel</Text></Pressable>
                <Pressable onPress={() => void submitReport()} style={styles.sendButton}><Text style={styles.sendText}>Send report</Text></Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7, minWidth: 54 },
  backText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  headerTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  content: { padding: 18, gap: 12 },
  loadingState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14, padding: 28 },
  loadingText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center" },
  errorState: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 30 },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 20, textAlign: "center" },
  errorText: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 20, textAlign: "center" },
  retryButton: { marginTop: 8, backgroundColor: Colors.brand.primary, borderRadius: 11, paddingHorizontal: 17, paddingVertical: 11 },
  retryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  verifiedNotice: { borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "flex-start", gap: 8 },
  verifiedCopy: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  inlineError: { color: "#92400E", backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, fontFamily: "Inter_400Regular", fontSize: 13 },
  alternativeCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  sectionTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  sectionCopy: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 6 },
  alternativeRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 12, borderTopWidth: 1 },
  alternativeName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  alternativeBrand: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  alternativeRating: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 11, maxWidth: 92, textAlign: "right" },
  reportBox: { borderWidth: 1, borderRadius: 14, padding: 14 },
  reportInput: { borderWidth: 1, borderRadius: 10, minHeight: 70, padding: 10, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 13, marginTop: 10 },
  reportActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10, alignItems: "center" },
  cancelButton: { paddingHorizontal: 8, paddingVertical: 10 },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  sendButton: { backgroundColor: Colors.brand.primary, paddingHorizontal: 14, minHeight: 40, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  sendText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
});