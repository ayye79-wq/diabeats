import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  Alert,
  ActivityIndicator,
  Image,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAiConsent } from "@/context/AiConsentContext";
import { scanResultSchema } from "@/shared/ai-safety";

type ScanResult = ReturnType<typeof scanResultSchema.parse>;

type Phase = "initial" | "loading" | "results" | "error";

const SCORE_BG: Record<string, string> = {
  good: Colors.brand.goodLight,
  caution: Colors.brand.cautionLight,
  avoid: Colors.brand.avoidLight,
};
const SCORE_TEXT: Record<string, string> = {
  good: Colors.brand.goodText,
  caution: Colors.brand.cautionText,
  avoid: Colors.brand.avoidText,
};
const SCORE_LABEL: Record<string, string> = {
  good: "Better Choice",
  caution: "Use Caution",
  avoid: "Avoid",
};

export default function ScanScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  const { isPremium, canScan, scansToday, SCAN_LIMIT, showPaywall, incrementScan } = useSubscription();
  const { requestConsent } = useAiConsent();

  const [phase, setPhase] = useState<Phase>("initial");
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : insets.bottom + 50;
  const scansLeft = SCAN_LIMIT - scansToday;

  const analyzeImage = async (base64: string, uri: string) => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    const agreed = await requestConsent();
    if (!agreed) return;
    setPreviewUri(uri);
    setPhase("loading");
    try {
      const res = await apiRequest("POST", "/api/scan-menu", { image: base64 });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      incrementScan();
      const validated = scanResultSchema.safeParse(data);
      if (!validated.success) throw new Error("The menu reading was incomplete. Try a clearer image.");
      setResult(validated.data);
      setPhase("results");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Could not analyze the menu. Please try again.";
      setErrorMsg(message);
      setPhase("error");
    }
  };

  const takePhoto = async () => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    if (Platform.OS === "web") {
      pickFromGallery();
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Camera Access Needed", "Please allow camera access in your settings to scan menus.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.75,
      base64: true,
    });
    if (!picked.canceled && picked.assets[0].base64) {
      analyzeImage(picked.assets[0].base64, picked.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== "granted") {
      Alert.alert("Gallery Access Needed", "Please allow photo library access in your settings.");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.75,
      base64: true,
    });
    if (!picked.canceled && picked.assets[0].base64) {
      analyzeImage(picked.assets[0].base64, picked.assets[0].uri);
    }
  };

  const reset = () => {
    setPhase("initial");
    setPreviewUri(null);
    setResult(null);
    setErrorMsg("");
  };

  if (phase === "loading") {
    return (
      <View style={[styles.centered, { backgroundColor: c.background }]}>
        {previewUri && (
          <Image source={{ uri: previewUri }} style={styles.previewBg} blurRadius={4} />
        )}
        <View style={styles.loadingOverlay}>
          <View style={styles.loadingCard}>
            <ActivityIndicator size="large" color={Colors.brand.primary} style={{ marginBottom: 16 }} />
            <Text style={styles.loadingTitle}>Analyzing menu…</Text>
              <Text style={styles.loadingSubtitle}>Reading visible items and noting uncertainty</Text>
          </View>
        </View>
      </View>
    );
  }

  if (phase === "error") {
    return (
      <View style={[styles.centered, { backgroundColor: c.background, paddingTop: topPad }]}>
        <Ionicons name="alert-circle-outline" size={56} color={Colors.brand.avoidText} />
        <Text style={[styles.errorTitle, { color: c.textPrimary }]}>Scan Failed</Text>
        <Text style={[styles.errorMsg, { color: c.textSecondary }]}>{errorMsg}</Text>
        <Pressable onPress={reset} style={styles.tryAgainBtn}>
          <Text style={styles.tryAgainBtnText}>Try Again</Text>
        </Pressable>
      </View>
    );
  }

  if (phase === "results" && result) {
    const goodCount = result.items.filter((i) => i.diabeticScore === "good").length;
    const avoidCount = result.items.filter((i) => i.diabeticScore === "avoid").length;

    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultsHeader, { paddingTop: topPad, backgroundColor: Colors.brand.primary }]}>
          <View style={styles.resultsHeaderRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.resultsRestaurantType}>{result.restaurantType}</Text>
              <Text style={styles.resultsTitle}>Menu Analysis</Text>
            </View>
            <Pressable onPress={reset} style={styles.rescanBtn}>
              <Ionicons name="camera-outline" size={18} color="#fff" />
              <Text style={styles.rescanBtnText}>Rescan</Text>
            </Pressable>
          </View>
          <View style={styles.resultsBadgeRow}>
            <View style={[styles.resultsBadge, { backgroundColor: Colors.brand.goodLight }]}>
              <Text style={[styles.resultsBadgeText, { color: Colors.brand.goodText }]}>{goodCount} Better Choices</Text>
            </View>
            {avoidCount > 0 && (
              <View style={[styles.resultsBadge, { backgroundColor: Colors.brand.avoidLight }]}>
                  <Text style={[styles.resultsBadgeText, { color: Colors.brand.avoidText }]}>{avoidCount} Higher-carb patterns</Text>
              </View>
            )}
          </View>
          <Text style={styles.resultsSummary}>{result.summary}</Text>
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad + 24 }]}
          showsVerticalScrollIndicator={false}
        >
            <View style={[styles.safetyCard, { backgroundColor: Colors.brand.cautionLight, borderColor: Colors.brand.caution }]}>
              <Ionicons name="information-circle-outline" size={16} color={Colors.brand.cautionText} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.safetyTitle, { color: Colors.brand.cautionText }]}>Image-based estimate</Text>
                <Text style={[styles.safetyText, { color: Colors.brand.cautionText }]}>Used: {result.informationUsed.join(" · ")}</Text>
                <Text style={[styles.safetyText, { color: Colors.brand.cautionText }]}>{result.limitations}</Text>
                <Text style={[styles.safetyText, { color: Colors.brand.cautionText }]}>{result.verification}</Text>
              </View>
            </View>
          {result.items.length === 0 ? (
            <View style={styles.noItems}>
              <Ionicons name="search-outline" size={40} color={c.textSecondary} />
              <Text style={[styles.noItemsText, { color: c.textSecondary }]}>
                No menu items could be identified. Try a clearer photo with better lighting.
              </Text>
            </View>
          ) : (
            result.items.map((item, idx) => (
              <View key={idx} style={[styles.itemCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
                <View style={styles.itemCardTop}>
                  <Text style={[styles.itemName, { color: c.textPrimary }]}>{item.name}</Text>
                  <View style={[styles.scorePill, { backgroundColor: SCORE_BG[item.diabeticScore] }]}>
                    <Text style={[styles.scorePillText, { color: SCORE_TEXT[item.diabeticScore] }]}>
                      {SCORE_LABEL[item.diabeticScore]}
                    </Text>
                  </View>
                </View>
                <Text style={[styles.itemDesc, { color: c.textSecondary }]}>{item.description}</Text>
                <View style={styles.itemMeta}>
                  <View style={[styles.carbPill, { backgroundColor: c.background, borderColor: c.border }]}>
                    <Ionicons name="nutrition-outline" size={12} color={c.textSecondary} />
                    <Text style={[styles.carbText, { color: c.textSecondary }]}>{item.carbRange}</Text>
                  </View>
                </View>
                <View style={[styles.tipRow, { backgroundColor: SCORE_BG[item.diabeticScore] + "60", borderRadius: 8, padding: 10 }]}>
                  <Ionicons name="bulb-outline" size={14} color={SCORE_TEXT[item.diabeticScore]} style={{ marginTop: 1 }} />
                  <Text style={[styles.tipText, { color: SCORE_TEXT[item.diabeticScore] }]}>{item.quickTip}</Text>
                </View>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <View style={[styles.initialHeader, { paddingTop: topPad + 8, backgroundColor: Colors.brand.primary }]}>
        <View style={styles.initialHeaderRow}>
          <Text style={styles.initialTitle}>Menu Scanner</Text>
          {!isPremium ? (
            <Pressable
              style={[styles.scanCountBadge, scansLeft <= 0 ? { backgroundColor: Colors.brand.avoidLight } : { backgroundColor: "rgba(255,255,255,0.2)" }]}
              onPress={() => showPaywall("scan-limit")}
            >
              <Text style={[styles.scanCountText, scansLeft <= 0 ? { color: Colors.brand.avoidText } : { color: "#fff" }]}>
                {scansLeft > 0 ? `${scansLeft}/${SCAN_LIMIT} scans left` : "Limit reached"}
              </Text>
            </Pressable>
          ) : (
            <View style={[styles.scanCountBadge, { backgroundColor: "rgba(255,255,255,0.2)" }]}>
              <Ionicons name="shield-checkmark" size={12} color="#fff" />
              <Text style={styles.scanCountText}>Unlimited</Text>
            </View>
          )}
        </View>
        <Text style={styles.initialSubtitle}>
          Scan a menu to compare visible food patterns. Results are estimates, not medical advice.
        </Text>
      </View>

      <ScrollView
        style={{ flex: 1, backgroundColor: c.background }}
        contentContainerStyle={[styles.initialBody, { paddingBottom: bottomPad + 16 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={[styles.scanIllustration, { borderColor: Colors.brand.primary + "40", backgroundColor: Colors.brand.goodLight }]}>
          <Ionicons name="scan-outline" size={64} color={Colors.brand.primary} />
        </View>

        <Text style={[styles.howItWorksTitle, { color: c.textPrimary }]}>How it works</Text>
        <View style={styles.stepsList}>
          {[
            { icon: "camera-outline", text: Platform.OS === "web" ? "Choose a photo of any restaurant menu" : "Take a photo of any restaurant menu" },
             { icon: "sparkles-outline", text: "AI reads only items it can make out" },
             { icon: "heart-outline", text: "Compare patterns, then verify with the restaurant" },
          ].map((step, i) => (
            <View key={i} style={styles.stepRow}>
              <View style={[styles.stepIcon, { backgroundColor: Colors.brand.goodLight }]}>
                <Ionicons name={step.icon as any} size={18} color={Colors.brand.primary} />
              </View>
              <Text style={[styles.stepText, { color: c.textSecondary }]}>{step.text}</Text>
            </View>
          ))}
        </View>

        <Pressable
          onPress={takePhoto}
          style={({ pressed }) => [styles.primaryBtn, { opacity: pressed ? 0.88 : 1 }]}
          accessibilityRole="button"
          accessibilityLabel={Platform.OS === "web" ? "Choose a menu image" : "Take a menu photo"}
          accessibilityHint={Platform.OS === "web" ? "Choose a menu image from your device" : "Open the camera to photograph a menu"}
        >
          <Ionicons name="camera" size={20} color="#fff" />
          <Text style={styles.primaryBtnText}>
            {Platform.OS === "web" ? "Choose a Menu Image" : "Take a Photo"}
          </Text>
        </Pressable>

        {Platform.OS !== "web" && (
          <Pressable
            onPress={pickFromGallery}
            style={({ pressed }) => [styles.secondaryBtn, { borderColor: Colors.brand.primary, opacity: pressed ? 0.88 : 1 }]}
            accessibilityRole="button"
            accessibilityLabel="Choose a menu image from your photo library"
          >
            <Ionicons name="images-outline" size={18} color={Colors.brand.primary} />
            <Text style={[styles.secondaryBtnText, { color: Colors.brand.primary }]}>Upload from Gallery</Text>
          </Pressable>
        )}

        <Text style={[styles.disclaimer, { color: c.textSecondary }]}>
          {Platform.OS === "web"
            ? "Choose a clear photo of a printed menu, chalkboard, or menu board."
            : "Works with printed menus, chalkboards, menu boards — any readable menu."}
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  previewBg: { ...StyleSheet.absoluteFill, opacity: 0.35 },
  loadingOverlay: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  loadingCard: { backgroundColor: "#fff", borderRadius: 20, padding: 32, alignItems: "center", width: 260, ...Platform.select({ web: { boxShadow: "0px 8px 20px rgba(0,0,0,0.15)" } as any, default: { shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.15, shadowRadius: 20, elevation: 10 } }) },
  loadingTitle: { fontFamily: "Inter_700Bold", fontSize: 18, color: "#1a1a1a", marginBottom: 6 },
  loadingSubtitle: { fontFamily: "Inter_400Regular", fontSize: 13, color: "#666", textAlign: "center", lineHeight: 18 },
  errorTitle: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 16, marginBottom: 8 },
  errorMsg: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20, marginBottom: 28 },
  tryAgainBtn: { backgroundColor: Colors.brand.primary, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 32 },
  tryAgainBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15, color: "#fff" },
  resultsHeader: { paddingHorizontal: 20, paddingBottom: 16 },
  resultsHeaderRow: { flexDirection: "row", alignItems: "flex-start", marginBottom: 10 },
  resultsRestaurantType: { fontFamily: "Inter_500Medium", fontSize: 12, color: "rgba(255,255,255,0.7)", marginBottom: 2 },
  resultsTitle: { fontFamily: "Inter_700Bold", fontSize: 24, color: "#fff" },
  resultsBadgeRow: { flexDirection: "row", gap: 8, marginBottom: 10 },
  resultsBadge: { borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  resultsBadgeText: { fontFamily: "Inter_600SemiBold", fontSize: 12 },
  resultsSummary: { fontFamily: "Inter_400Regular", fontSize: 13, color: "rgba(255,255,255,0.85)", lineHeight: 18 },
  rescanBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(255,255,255,0.2)", borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
  rescanBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  resultsContent: { padding: 16, gap: 12 },
  safetyCard: { flexDirection: "row", alignItems: "flex-start", gap: 8, borderRadius: 12, borderWidth: 1, padding: 12 },
  safetyTitle: { fontFamily: "Inter_700Bold", fontSize: 12, marginBottom: 3 },
  safetyText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 2 },
  noItems: { alignItems: "center", paddingTop: 48, gap: 12 },
  noItemsText: { fontFamily: "Inter_400Regular", fontSize: 14, textAlign: "center", lineHeight: 20 },
  itemCard: { borderRadius: 14, borderWidth: 1, padding: 14, gap: 8 },
  itemCardTop: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 8 },
  itemName: { flex: 1, fontFamily: "Inter_600SemiBold", fontSize: 15, lineHeight: 20 },
  scorePill: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  scorePillText: { fontFamily: "Inter_700Bold", fontSize: 11, letterSpacing: 0.3 },
  itemDesc: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 18 },
  itemMeta: { flexDirection: "row" },
  carbPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  carbText: { fontFamily: "Inter_400Regular", fontSize: 12 },
  tipRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  tipText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 17 },
  initialHeader: { paddingHorizontal: 20, paddingBottom: 24 },
  initialHeaderRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  initialTitle: { fontFamily: "Inter_700Bold", fontSize: 28, color: "#fff" },
  scanCountBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  scanCountText: { fontFamily: "Inter_500Medium", fontSize: 12, color: "#fff" },
  initialSubtitle: { fontFamily: "Inter_400Regular", fontSize: 15, color: "rgba(255,255,255,0.85)", lineHeight: 22 },
  initialBody: { flexGrow: 1, padding: 24, alignItems: "center" },
  scanIllustration: { width: 120, height: 120, borderRadius: 30, borderWidth: 2, alignItems: "center", justifyContent: "center", marginTop: 8, marginBottom: 28 },
  howItWorksTitle: { fontFamily: "Inter_600SemiBold", fontSize: 16, alignSelf: "flex-start", marginBottom: 14 },
  stepsList: { width: "100%", gap: 12, marginBottom: 32 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepIcon: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  stepText: { flex: 1, fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 19 },
  primaryBtn: { width: "100%", backgroundColor: Colors.brand.primary, borderRadius: 14, paddingVertical: 16, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, marginBottom: 12 },
  primaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 16, color: "#fff" },
  secondaryBtn: { width: "100%", borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginBottom: 20 },
  secondaryBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 15 },
  disclaimer: { fontFamily: "Inter_400Regular", fontSize: 12, textAlign: "center", lineHeight: 17 },
});
