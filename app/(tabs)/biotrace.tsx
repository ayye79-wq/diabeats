import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useColorScheme,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import type { NormalizedProduct, ProductSearchHit } from "@/shared/biotrace";
import type { BioTraceRating } from "@/shared/biotrace-rating";
import { BioTraceResult } from "@/components/BioTraceResult";
import { recordLocalBioTraceScan, syncPendingBioTraceScans } from "@/lib/biotrace-history";

type Result = { product: NormalizedProduct; rating: BioTraceRating };
type ScanMode = "start" | "camera" | "results";
type Alternative = Result;

function readableError(error: unknown) {
  const message = error instanceof Error ? error.message : "Could not look up this product.";
  if (message.includes("404")) return "We couldn't find that product in Open Food Facts. Check the barcode or try searching by name.";
  if (message.includes("429")) return "Product lookup is temporarily busy. Please wait a moment and try again.";
  if (message.includes("503")) return "Open Food Facts is unavailable right now. Please try again shortly.";
  return message.replace(/^\d+:\s*/, "");
}

export default function BioTraceScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const [mode, setMode] = useState<ScanMode>("start");
  const [barcode, setBarcode] = useState("");
  const [productQuery, setProductQuery] = useState("");
  const [hits, setHits] = useState<ProductSearchHit[]>([]);
  const [result, setResult] = useState<Result | null>(null);
  const [alternatives, setAlternatives] = useState<Alternative[]>([]);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportValue, setReportValue] = useState("");
  const [permission, requestPermission] = useCameraPermissions();

  const topPad = Platform.OS === "web" ? 66 : insets.top + 10;
  const bottomPad = Platform.OS === "web" ? 106 : insets.bottom + 84;

  useEffect(() => {
    void syncPendingBioTraceScans();
  }, []);

  const recordScan = useCallback(async (next: Result, source: "barcode" | "search" | "manual") => {
    if (!next.product.barcode) return;
    await recordLocalBioTraceScan(next, source);
    try {
      await syncPendingBioTraceScans();
    } catch {
      // Lookup remains usable if a private history write fails.
    }
  }, []);

  const lookupBarcode = useCallback(async (raw = barcode, source: "barcode" | "search" | "manual" = "barcode") => {
    const cleaned = raw.replace(/\D/g, "");
    if (!/^\d{8,14}$/.test(cleaned)) {
      setError("Enter an 8–14 digit barcode, or search by product name.");
      return;
    }
    setLoading(true);
    setError(null);
    setAlternatives([]);
    try {
      const res = await apiRequest("GET", `/api/biotrace/product/${cleaned}`);
      const next = (await res.json()) as Result;
      setBarcode(cleaned);
      setResult(next);
      setSaved(false);
      setMode("results");
      void recordScan(next, source);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [barcode, recordScan]);

  const searchByName = useCallback(async () => {
    const query = productQuery.trim();
    if (!query) {
      setError("Enter a product or brand to search.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/biotrace/search?q=${encodeURIComponent(query)}&pageSize=12`);
      const data = (await res.json()) as { hits: ProductSearchHit[] };
      setHits(data.hits ?? []);
      if (!(data.hits ?? []).length) setError("No products matched that search. Try a brand name or scan the barcode.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [productQuery]);

  const saveFood = useCallback(async () => {
    if (!result) return;
    if (!result.product.barcode) {
      setError("Only barcode-backed products can be saved, so BioTrace can keep the public label data accurate.");
      return;
    }
    setLoading(true);
    try {
      await apiRequest("POST", "/api/biotrace/saved", {
        barcode: result.product.barcode,
        source: "barcode",
      });
      setSaved(true);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [result]);

  const loadAlternatives = useCallback(async () => {
    if (!result?.product.barcode) {
      setError("Alternatives need a barcode-backed product.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest("GET", `/api/biotrace/alternatives/${result.product.barcode}?limit=5`);
      const data = (await res.json()) as { alternatives?: Alternative[] };
      setAlternatives(data.alternatives ?? []);
      if (!(data.alternatives ?? []).length) setError("No clearly better alternatives were found in the public product data.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [result]);

  const submitReport = useCallback(async () => {
    if (!result || !reportValue.trim()) return;
    setLoading(true);
    try {
      await apiRequest("POST", "/api/biotrace/corrections", {
        barcode: result.product.barcode,
        productName: result.product.name,
        field: "product-data",
        reportedValue: reportValue.trim(),
        details: "Submitted from BioTrace mobile app.",
      });
      setShowReport(false);
      setReportValue("");
      Alert.alert("Report sent", "Thanks. We recorded the issue without storing your label photo.");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [reportValue, result]);

  if (mode === "camera") {
    return (
      <View style={[styles.cameraPage, { backgroundColor: "#0B1810", paddingTop: topPad }]}>
        <View style={styles.cameraHeader}>
          <Pressable onPress={() => setMode("start")} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close barcode scanner">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.cameraTitle}>Scan product barcode</Text>
          <View style={{ width: 28 }} />
        </View>
        {!permission?.granted ? (
          <View style={styles.cameraPermission}>
            <Ionicons name="camera-outline" size={50} color="#D8F3E1" />
            <Text style={styles.cameraPermissionTitle}>Camera access needed</Text>
            <Text style={styles.cameraPermissionText}>Use the camera to read package barcodes, or enter one manually instead.</Text>
            <Pressable onPress={requestPermission} style={styles.primaryBtn} accessibilityRole="button" accessibilityLabel="Allow camera access for barcode scanning">
              <Text style={styles.primaryBtnText}>Allow camera</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128"] }}
            onBarcodeScanned={({ data }) => {
              setMode("start");
              setBarcode(data);
              void lookupBarcode(data);
            }}
          >
            <View style={styles.scannerGuide}>
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHelp}>Line up the barcode inside the frame</Text>
            </View>
          </CameraView>
        )}
      </View>
    );
  }

  if (mode === "results" && result) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPad, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <Pressable onPress={() => { setMode("start"); setResult(null); setAlternatives([]); }} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Start a new BioTrace scan">
            <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
            <Text style={[styles.backText, { color: c.textPrimary }]}>New scan</Text>
          </Pressable>
          <Pressable onPress={() => router.push("/(tabs)/saved")} hitSlop={10} accessibilityRole="button" accessibilityLabel="Open saved foods and scan history">
            <Ionicons name="bookmark-outline" size={21} color={Colors.brand.primary} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          <BioTraceResult product={result.product} rating={result.rating} dark={isDark} saved={saved} onSave={saveFood} onAlternatives={loadAlternatives} onReport={() => setShowReport(true)} />
          {loading ? <ActivityIndicator color={Colors.brand.primary} style={{ marginVertical: 16 }} /> : null}
          {alternatives.length ? (
            <View style={[styles.alternativeCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
              <Text style={[styles.alternativeTitle, { color: c.textPrimary }]}>Better alternatives</Text>
              <Text style={[styles.alternativeCopy, { color: c.textSecondary }]}>Ranked with the same transparent rules from comparable public listings.</Text>
              {alternatives.map((alternative) => (
                <Pressable
                  key={`${alternative.product.barcode}-${alternative.product.name}`}
                  onPress={() => { setResult(alternative); setSaved(false); setAlternatives([]); }}
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
              <Text style={[styles.reportTitle, { color: c.textPrimary }]}>What looks incorrect?</Text>
              <TextInput value={reportValue} onChangeText={setReportValue} placeholder="Example: ingredients changed on my package" placeholderTextColor={c.textMuted} style={[styles.reportInput, { borderColor: c.border, color: c.textPrimary }]} multiline accessibilityLabel="Describe incorrect product information" />
              <View style={styles.reportActions}>
                <Pressable onPress={() => setShowReport(false)} style={styles.cancelBtn}><Text style={[styles.cancelText, { color: c.textSecondary }]}>Cancel</Text></Pressable>
                <Pressable onPress={submitReport} style={styles.primaryBtn}><Text style={styles.primaryBtnText}>Send report</Text></Pressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: topPad, paddingBottom: bottomPad }]} keyboardShouldPersistTaps="handled">
        <View style={styles.heading}>
          <View style={styles.iconCircle}><Ionicons name="barcode-outline" size={27} color="#fff" /></View>
          <Text style={[styles.title, { color: c.textPrimary }]}>Scan Food</Text>
          <Text style={[styles.poweredBy, { color: Colors.brand.primary }]}>Powered by BioTrace</Text>
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>Scan packaged foods for clear, diabetes-conscious label insights.</Text>
        </View>

        <Pressable onPress={() => setMode("camera")} style={styles.scanButton} accessibilityRole="button" accessibilityLabel="Scan a packaged food barcode" accessibilityHint="Open the barcode camera">
          <Ionicons name="scan-outline" size={24} color="#fff" />
          <View style={{ flex: 1 }}><Text style={styles.scanButtonTitle}>Scan a barcode</Text><Text style={styles.scanButtonSub}>Fast lookup from a package</Text></View>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Enter a barcode</Text>
          <View style={styles.inputRow}>
            <TextInput value={barcode} onChangeText={(text) => setBarcode(text.replace(/\D/g, "").slice(0, 14))} keyboardType="number-pad" placeholder="8–14 digits" placeholderTextColor={c.textMuted} style={[styles.input, { color: c.textPrimary, borderColor: c.border }]} onSubmitEditing={() => lookupBarcode()} accessibilityLabel="Product barcode" accessibilityHint="Enter 8 to 14 digits" />
            <Pressable onPress={() => lookupBarcode()} style={styles.lookupBtn} disabled={loading} accessibilityRole="button" accessibilityLabel="Look up barcode" accessibilityState={{ disabled: loading, busy: loading }}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.lookupText}>Look up</Text>}
            </Pressable>
          </View>
        </View>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Search by product name</Text>
          <View style={styles.inputRow}>
            <TextInput value={productQuery} onChangeText={setProductQuery} placeholder="e.g. plain Greek yogurt" placeholderTextColor={c.textMuted} style={[styles.input, { color: c.textPrimary, borderColor: c.border }]} onSubmitEditing={searchByName} accessibilityLabel="Search products by name" />
            <Pressable onPress={searchByName} style={styles.iconLookupBtn} disabled={loading} accessibilityRole="button" accessibilityLabel="Search products" accessibilityState={{ disabled: loading, busy: loading }}><Ionicons name="search" size={20} color="#fff" /></Pressable>
          </View>
          {hits.map((hit) => (
            <Pressable key={`${hit.barcode}-${hit.name}`} onPress={() => hit.barcode ? lookupBarcode(hit.barcode, "search") : setError("This result has no usable barcode. Try scanning the package.")} style={[styles.hitRow, { borderTopColor: c.border }]} accessibilityRole="button" accessibilityLabel={`${hit.name}, ${hit.brand ?? "brand not listed"}${hit.barcode ? "" : ", barcode unavailable"}`}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.hitName, { color: c.textPrimary }]} numberOfLines={1}>{hit.name}</Text>
                <Text style={[styles.hitSub, { color: c.textSecondary }]}>{hit.brand ?? "Brand not listed"}{hit.nutriScore ? ` · Nutri-Score ${hit.nutriScore.toUpperCase()}` : ""}</Text>
              </View>
              <Ionicons name={hit.barcode ? "arrow-forward-circle-outline" : "information-circle-outline"} size={21} color={Colors.brand.primary} />
            </Pressable>
          ))}
        </View>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={styles.labelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Label photo analysis</Text>
              <Text style={[styles.labelCopy, { color: c.textSecondary }]}>
                Take or upload a label photo to analyze it with BioTrace.
              </Text>
            </View>
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonText}>Coming Soon</Text>
            </View>
          </View>
          <Text style={[styles.labelComingSoonCopy, { color: c.textMuted }]}>
            For now, use the barcode or product-name lookup above for verified public product data.
          </Text>
        </View>

        {error ? <View style={styles.errorBox} accessibilityLiveRegion="polite"><Ionicons name="information-circle-outline" size={18} color="#92400E" /><Text style={styles.errorText}>{error}</Text></View> : null}
        <View style={styles.privacyRow}><Ionicons name="shield-checkmark-outline" size={17} color={Colors.brand.primary} /><Text style={[styles.privacyText, { color: c.textSecondary }]}>Products come from Open Food Facts. Your saved foods and scan history are private to this app session; delete them any time in Saved.</Text></View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingHorizontal: 18, gap: 13 },
  heading: { marginBottom: 4 },
  iconCircle: { width: 50, height: 50, borderRadius: 16, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", marginBottom: 11 },
  title: { fontSize: 29, fontFamily: "Inter_700Bold" },
  poweredBy: { fontFamily: "Inter_600SemiBold", fontSize: 12, marginTop: 4 },
  subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 21, marginTop: 5, maxWidth: 330 },
  scanButton: { minHeight: 80, backgroundColor: Colors.brand.primary, borderRadius: 17, padding: 17, flexDirection: "row", alignItems: "center", gap: 13 },
  scanButtonTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  scanButtonSub: { color: "#D8F3E1", fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15 },
  cardTitle: { fontFamily: "Inter_700Bold", fontSize: 16, marginBottom: 10 },
  inputRow: { flexDirection: "row", gap: 8 },
  input: { flex: 1, height: 45, borderWidth: 1, borderRadius: 11, paddingHorizontal: 12, fontFamily: "Inter_400Regular", fontSize: 14 },
  lookupBtn: { minWidth: 78, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brand.primary },
  lookupText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  iconLookupBtn: { width: 46, borderRadius: 11, alignItems: "center", justifyContent: "center", backgroundColor: Colors.brand.primary },
  hitRow: { paddingTop: 12, marginTop: 11, borderTopWidth: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  hitName: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  hitSub: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 3 },
  labelHeader: { flexDirection: "row", gap: 8 },
  labelCopy: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  comingSoonPill: { backgroundColor: "#E8F7ED", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 7, alignSelf: "flex-start" },
  comingSoonText: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 11 },
  labelComingSoonCopy: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 10 },
  errorBox: { flexDirection: "row", gap: 8, borderRadius: 12, padding: 12, backgroundColor: "#FEF3C7" },
  errorText: { flex: 1, color: "#92400E", fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  privacyRow: { flexDirection: "row", gap: 8, paddingHorizontal: 4, alignItems: "flex-start" },
  privacyText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16 },
  cameraPage: { flex: 1 },
  cameraHeader: { paddingHorizontal: 18, paddingBottom: 16, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cameraTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 16 },
  camera: { flex: 1 },
  scannerGuide: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.22)" },
  scannerFrame: { width: "78%", height: 165, borderColor: "#D8F3E1", borderWidth: 3, borderRadius: 16 },
  scannerHelp: { color: "#fff", fontFamily: "Inter_600SemiBold", fontSize: 14, marginTop: 22, textAlign: "center" },
  cameraPermission: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 34 },
  cameraPermissionTitle: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 21, marginTop: 16 },
  cameraPermissionText: { color: "#C4DACB", fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20, marginTop: 8, marginBottom: 20 },
  primaryBtn: { backgroundColor: Colors.brand.primary, paddingHorizontal: 18, minHeight: 42, borderRadius: 10, justifyContent: "center", alignItems: "center" },
  primaryBtnText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  resultHeader: { paddingHorizontal: 18, paddingBottom: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1 },
  backButton: { flexDirection: "row", alignItems: "center", gap: 7 },
  backText: { fontFamily: "Inter_600SemiBold", fontSize: 14 },
  resultsContent: { padding: 18, gap: 12 },
  inlineError: { color: "#92400E", backgroundColor: "#FEF3C7", borderRadius: 10, padding: 10, fontFamily: "Inter_400Regular", fontSize: 13 },
  alternativeCard: { borderWidth: 1, borderRadius: 16, padding: 15 },
  alternativeTitle: { fontFamily: "Inter_700Bold", fontSize: 16 },
  alternativeCopy: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18, marginTop: 4, marginBottom: 6 },
  alternativeRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingVertical: 12, borderTopWidth: 1 },
  alternativeName: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
  alternativeBrand: { fontFamily: "Inter_400Regular", fontSize: 11, marginTop: 3 },
  alternativeRating: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 11, maxWidth: 92, textAlign: "right" },
  reportBox: { borderWidth: 1, borderRadius: 14, padding: 14 },
  reportTitle: { fontFamily: "Inter_700Bold", fontSize: 15, marginBottom: 9 },
  reportInput: { borderWidth: 1, borderRadius: 10, minHeight: 70, padding: 10, textAlignVertical: "top", fontFamily: "Inter_400Regular", fontSize: 13 },
  reportActions: { flexDirection: "row", justifyContent: "flex-end", gap: 10, marginTop: 10, alignItems: "center" },
  cancelBtn: { paddingHorizontal: 8, paddingVertical: 10 },
  cancelText: { fontFamily: "Inter_600SemiBold", fontSize: 13 },
});