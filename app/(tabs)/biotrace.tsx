import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
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
import * as ImagePicker from "expo-image-picker";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { apiRequest } from "@/lib/query-client";
import { readableBioTraceError } from "@/lib/biotrace-errors";
import {
  classifyBioTraceIdentifier,
  type NormalizedProduct,
  type ProductResolution,
  type ProductSearchHit,
} from "@/shared/biotrace";
import {
  computeBioTraceRating,
  getBioTraceProfileHeaders,
  type BioTraceProfile,
  type BioTraceRating,
} from "@/shared/biotrace-rating";
import type { IngredientAnalysis } from "@/shared/biotrace-ingredients";
import { analyzeIngredients } from "@/shared/biotrace-ingredients";
import { BioTraceResult } from "@/components/BioTraceResult";
import { BioTraceLabelResult, BioTraceLabelReview } from "@/components/BioTraceLabel";
import { StructuredQrMenuResult } from "@/components/StructuredQrMenuResult";
import { recordLocalBioTraceScan, syncPendingBioTraceScans } from "@/lib/biotrace-history";
import { useSubscription } from "@/context/SubscriptionContext";
import { useAiConsent } from "@/context/AiConsentContext";
import { useApp } from "@/context/AppContext";
import {
  computeBloodSugarFit,
  labelAnalysisSchema,
  type BloodSugarFit,
  type LabelAnalysis,
  type LabelExtraction,
} from "@/shared/biotrace-label";
import type { BioTraceQrResolution } from "@/shared/biotrace-qr";
import { parseStructuredQrMenu } from "@/shared/structured-qr-menu";

type Result = { product: NormalizedProduct; rating: BioTraceRating; ingredientAnalysis: IngredientAnalysis };
type QrDisplayResult = Exclude<BioTraceQrResolution, { kind: "barcode" }>;
type UnknownResult = {
  kind: "unknown";
  identifier: string;
  resolution: ProductResolution;
  recoveryActions: readonly ["search-by-name", "label-photo", "manual-entry"];
  qrSource?: "raw-barcode" | "open-food-facts-url" | "gs1-digital-link";
};
type QrApiResponse =
  | { kind: "product"; result: Result; qrSource: "raw-barcode" | "open-food-facts-url" | "gs1-digital-link" }
  | UnknownResult
  | QrDisplayResult;
type GenericSearchResolution =
  | { kind: "product"; result: Result }
  | { kind: "confirmation-required"; candidateNames: string[]; reason: string }
  | { kind: "unknown" };
type ScanMode = "start" | "camera" | "results" | "qr-results" | "unknown";
type Alternative = Result;
type LabelPhase = "idle" | "loading" | "review" | "results" | "error";

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
  const [qrResult, setQrResult] = useState<QrDisplayResult | null>(null);
  const [unknownResult, setUnknownResult] = useState<UnknownResult | null>(null);
  const [genericSearch, setGenericSearch] = useState<GenericSearchResolution | null>(null);
  const [showReport, setShowReport] = useState(false);
  const [reportValue, setReportValue] = useState("");
  const [permission, requestPermission] = useCameraPermissions();
  const [labelPhase, setLabelPhase] = useState<LabelPhase>("idle");
  const [labelAnalysis, setLabelAnalysis] = useState<LabelAnalysis | null>(null);
  const [labelScore, setLabelScore] = useState<BloodSugarFit | null>(null);
  const [labelPreviewUri, setLabelPreviewUri] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const scanInProgressRef = useRef(false);
  const { canScan, showPaywall, incrementScan } = useSubscription();
  const { requestConsent } = useAiConsent();
  const { diabetesType, dietGoal, dailyCarbTarget, usesInsulin } = useApp();
  const bioTraceProfile = useMemo<BioTraceProfile>(
    () => ({ diabetesType, dietGoal, dailyCarbTarget, usesInsulin }),
    [dailyCarbTarget, diabetesType, dietGoal, usesInsulin],
  );
  const bioTraceProfileRef = useRef(bioTraceProfile);
  const profileHeaders = useMemo(
    () => getBioTraceProfileHeaders(bioTraceProfile),
    [bioTraceProfile],
  );
  const personalizeResult = useCallback(
    (next: Result): Result => ({
      ...next,
      rating: computeBioTraceRating(next.product, bioTraceProfileRef.current),
    }),
    [],
  );

  const topPad = Platform.OS === "web" ? 66 : insets.top + 10;
  const bottomPad = Platform.OS === "web" ? 106 : insets.bottom + 84;

  useEffect(() => {
    void syncPendingBioTraceScans();
  }, []);

  useEffect(() => {
    bioTraceProfileRef.current = bioTraceProfile;
    setResult((current) =>
      current
        ? { ...current, rating: computeBioTraceRating(current.product, bioTraceProfile) }
        : current,
    );
    setAlternatives((current) =>
      current.map((alternative) => ({
        ...alternative,
        rating: computeBioTraceRating(alternative.product, bioTraceProfile),
      })),
    );
    setGenericSearch((current) =>
      current?.kind === "product"
        ? { ...current, result: personalizeResult(current.result) }
        : current,
    );
  }, [bioTraceProfile, personalizeResult]);

  useEffect(() => {
    if (labelPhase === "results" && labelAnalysis) {
      setLabelScore(computeBloodSugarFit(labelAnalysis.extraction.nutrition, bioTraceProfile));
    }
  }, [bioTraceProfile, labelAnalysis, labelPhase]);

  const recordScan = useCallback(async (next: Result, source: "barcode" | "search" | "manual" | "qr") => {
    if (!next.product.barcode) return;
    await recordLocalBioTraceScan(next, source);
    try {
      await syncPendingBioTraceScans();
    } catch {
      // Lookup remains usable if a private history write fails.
    }
  }, []);

  const lookupBarcode = useCallback(async (
    raw = barcode,
    source: "barcode" | "search" | "manual" | "qr" = "barcode",
    origin: "camera" | "manual" = "manual",
  ) => {
    const cleaned = raw.replace(/\D/g, "");
    const classified = classifyBioTraceIdentifier(cleaned, origin);
    if (classified.kind === "human-readable-plu") {
      setUnknownResult({
        kind: "unknown",
        identifier: classified.value,
        resolution: {
          kind: "confirmation-required",
          evidenceType: "human-readable-plu",
          confidence: "user-supplied",
          confirmationRequired: true,
          explanation: "This may be a human-readable PLU, but BioTrace has no approved PLU data source to identify it. Confirm the food by name or photo.",
        },
        recoveryActions: ["search-by-name", "label-photo", "manual-entry"],
      });
      setError(null);
      setMode("unknown");
      return;
    }
    if (classified.kind !== "gtin") {
      setError("Enter a 4–5 digit printed PLU or an 8–14 digit barcode, or search by product name.");
      return;
    }
    setLoading(true);
    setError(null);
    setAlternatives([]);
    try {
      const res = await apiRequest("GET", `/api/biotrace/product/${cleaned}`, undefined, profileHeaders);
      const response = (await res.json()) as Result | UnknownResult;
      if ("kind" in response && response.kind === "unknown") {
        setUnknownResult(response);
        setResult(null);
        setMode("unknown");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      const next = personalizeResult(response as Result);
      setBarcode(cleaned);
      setResult(next);
      setSaved(false);
      setMode("results");
      void recordScan(next, source);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(readableBioTraceError(err));
    } finally {
      setLoading(false);
    }
  }, [barcode, personalizeResult, profileHeaders, recordScan]);

  const lookupQr = useCallback(async (payload: string) => {
    setLoading(true);
    setError(null);
    setAlternatives([]);
    try {
      const res = await apiRequest("POST", "/api/biotrace/qr", { payload }, profileHeaders);
      const response = (await res.json()) as QrApiResponse;
      if (response.kind === "unknown") {
        setUnknownResult(response);
        setQrResult(null);
        setResult(null);
        setMode("unknown");
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        return;
      }
      if (response.kind !== "product") {
        setQrResult(response);
        setResult(null);
        setMode("qr-results");
        Haptics.notificationAsync(
          response.kind === "unsupported"
            ? Haptics.NotificationFeedbackType.Warning
            : Haptics.NotificationFeedbackType.Success,
        );
        return;
      }
      const next = personalizeResult(response.result);
      setQrResult(null);
      setBarcode(next.product.barcode ?? "");
      setResult(next);
      setSaved(false);
      setMode("results");
      void recordScan(next, "qr");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (err) {
      setError(readableBioTraceError(err));
    } finally {
      setLoading(false);
    }
  }, [personalizeResult, profileHeaders, recordScan]);

  const searchByName = useCallback(async () => {
    const query = productQuery.trim();
    if (!query) {
      setError("Enter a product or brand to search.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest(
        "GET",
        `/api/biotrace/search?q=${encodeURIComponent(query)}&pageSize=12`,
        undefined,
        profileHeaders,
      );
      const data = (await res.json()) as { hits: ProductSearchHit[]; generic?: GenericSearchResolution };
      setHits(data.hits ?? []);
      setGenericSearch(
        data.generic?.kind === "product"
          ? { ...data.generic, result: personalizeResult(data.generic.result) }
          : data.generic ?? null,
      );
      if (!(data.hits ?? []).length && (!data.generic || data.generic.kind === "unknown")) {
        setError("No products matched that search. Try another name, take a label photo, or enter the code manually.");
      }
    } catch (err) {
      setError(readableBioTraceError(err));
    } finally {
      setLoading(false);
    }
  }, [personalizeResult, productQuery, profileHeaders]);

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
      setError(readableBioTraceError(err));
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
      const res = await apiRequest(
        "GET",
        `/api/biotrace/alternatives/${result.product.barcode}?limit=5`,
        undefined,
        profileHeaders,
      );
      const data = (await res.json()) as { alternatives?: Alternative[] };
      setAlternatives((data.alternatives ?? []).map(personalizeResult));
      if (!(data.alternatives ?? []).length) setError("No clearly better alternatives were found in the public product data.");
    } catch (err) {
      setError(readableBioTraceError(err));
    } finally {
      setLoading(false);
    }
  }, [personalizeResult, profileHeaders, result]);

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
      setError(readableBioTraceError(err));
    } finally {
      setLoading(false);
    }
  }, [reportValue, result]);

  const resetLabelScan = useCallback(() => {
    setLabelPhase("idle");
    setLabelAnalysis(null);
    setLabelScore(null);
    setLabelPreviewUri(null);
    setLabelError(null);
  }, []);

  const analyzeLabelImage = useCallback(async (base64: string, uri: string, mimeType: string | null | undefined) => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    const agreed = await requestConsent();
    if (!agreed) return;

    setLabelError(null);
    setLabelPreviewUri(uri);
    setLabelPhase("loading");
    try {
      const imageType = ["image/jpeg", "image/png", "image/webp"].includes(mimeType ?? "") ? mimeType : "image/jpeg";
      const res = await apiRequest("POST", "/api/biotrace/label", { image: base64, imageType });
      const data: unknown = await res.json();
      const parsed = labelAnalysisSchema.safeParse(data);
      if (!parsed.success) throw new Error("The label could not be read. Try a sharper photo with the label fully in frame.");
      incrementScan();
      setLabelPreviewUri(null);
      if (parsed.data.extraction.status === "unreadable") {
        setLabelError("We couldn't make out enough label text. Try better lighting and hold the camera steady.");
        setLabelPhase("error");
        return;
      }
      setLabelAnalysis(parsed.data);
      setLabelPhase("review");
    } catch (err) {
      setLabelPreviewUri(null);
      setLabelError(readableBioTraceError(err, "Could not analyze this label."));
      setLabelPhase("error");
    }
  }, [canScan, incrementScan, requestConsent, showPaywall]);

  const chooseLabelPhoto = useCallback(async () => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.8,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset?.base64) {
      setLabelError("This photo could not be prepared. Please choose another image.");
      setLabelPhase("error");
      return;
    }
    void analyzeLabelImage(asset.base64, asset.uri, asset.mimeType);
  }, [analyzeLabelImage, canScan, showPaywall]);

  const takeLabelPhoto = useCallback(async () => {
    if (!canScan) {
      showPaywall("scan-limit");
      return;
    }
    if (Platform.OS === "web") {
      void chooseLabelPhoto();
      return;
    }
    const { status } = await ImagePicker.requestCameraPermissionsAsync();
    if (status !== "granted") {
      setLabelError("Camera access was denied. Allow camera access in settings, or choose a photo instead.");
      setLabelPhase("error");
      return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const picked = await ImagePicker.launchCameraAsync({
      mediaTypes: "images",
      quality: 0.8,
      base64: true,
      exif: false,
    });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset?.base64) {
      setLabelError("This photo could not be prepared. Please try again or choose a photo.");
      setLabelPhase("error");
      return;
    }
    void analyzeLabelImage(asset.base64, asset.uri, asset.mimeType);
  }, [analyzeLabelImage, canScan, chooseLabelPhoto, showPaywall]);

  const confirmLabel = useCallback((extraction: LabelExtraction) => {
    const confirmedAnalysis: LabelAnalysis = {
      extraction,
      ingredientAnalysis: analyzeIngredients(extraction.ingredientsText),
    };
    setLabelAnalysis(confirmedAnalysis);
    setLabelScore(computeBloodSugarFit(extraction.nutrition, bioTraceProfile));
    setLabelPhase("results");
  }, [bioTraceProfile]);

  const openCamera = useCallback(() => {
    scanInProgressRef.current = false;
    setError(null);
    setQrResult(null);
    setUnknownResult(null);
    setMode("camera");
  }, []);

  const closeCamera = useCallback(() => {
    scanInProgressRef.current = false;
    setMode("start");
  }, []);

  if (labelPhase === "loading") {
    return (
      <View style={[styles.labelState, { backgroundColor: c.background }]}>
        {labelPreviewUri ? <View style={styles.labelPreview}><Text style={styles.labelPreviewText}>Photo received</Text></View> : null}
        <View style={[styles.labelLoadingCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <ActivityIndicator size="large" color={Colors.brand.primary} />
          <Text style={[styles.labelStateTitle, { color: c.textPrimary }]}>Reading your label…</Text>
          <Text style={[styles.labelStateCopy, { color: c.textSecondary }]}>BioTrace is transcribing only text it can clearly see.</Text>
        </View>
      </View>
    );
  }

  if (labelPhase === "error") {
    return (
      <View style={[styles.labelState, { backgroundColor: c.background, paddingTop: topPad, paddingBottom: bottomPad }]}>
        <Ionicons name="image-outline" size={54} color={Colors.brand.cautionText} />
        <Text style={[styles.labelStateTitle, { color: c.textPrimary }]}>Label scan needs another look</Text>
        <Text style={[styles.labelStateCopy, { color: c.textSecondary }]}>{labelError ?? "We couldn't read that label."}</Text>
        <Pressable onPress={takeLabelPhoto} style={styles.labelStatePrimary} accessibilityRole="button" accessibilityLabel={Platform.OS === "web" ? "Choose another label photo" : "Take another label photo"}>
          <Ionicons name="camera-outline" size={19} color="#fff" />
          <Text style={styles.labelStatePrimaryText}>{Platform.OS === "web" ? "Choose another photo" : "Try another photo"}</Text>
        </Pressable>
        <Pressable onPress={resetLabelScan} style={styles.labelBackButton} accessibilityRole="button" accessibilityLabel="Back to BioTrace barcode and product search">
          <Text style={[styles.labelBackText, { color: Colors.brand.primary }]}>Back to BioTrace</Text>
        </Pressable>
      </View>
    );
  }

  if (labelPhase === "review" && labelAnalysis) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPad, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <Pressable onPress={resetLabelScan} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Cancel label review">
            <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
            <Text style={[styles.backText, { color: c.textPrimary }]}>Cancel</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          <BioTraceLabelReview extraction={labelAnalysis.extraction} dark={isDark} onConfirm={confirmLabel} onRetake={takeLabelPhoto} />
        </ScrollView>
      </View>
    );
  }

  if (labelPhase === "results" && labelAnalysis && labelScore) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPad, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <Pressable onPress={resetLabelScan} style={styles.backButton} accessibilityRole="button" accessibilityLabel="Start a new BioTrace scan">
            <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
            <Text style={[styles.backText, { color: c.textPrimary }]}>New scan</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          <BioTraceLabelResult extraction={labelAnalysis.extraction} ingredientAnalysis={labelAnalysis.ingredientAnalysis} score={labelScore} dark={isDark} onNewScan={resetLabelScan} />
        </ScrollView>
      </View>
    );
  }

  if (mode === "camera") {
    return (
      <View style={[styles.cameraPage, { backgroundColor: "#0B1810", paddingTop: topPad }]}>
        <View style={styles.cameraHeader}>
          <Pressable onPress={closeCamera} hitSlop={12} accessibilityRole="button" accessibilityLabel="Close barcode scanner">
            <Ionicons name="close" size={28} color="#fff" />
          </Pressable>
          <Text style={styles.cameraTitle}>Scan product barcode or QR code</Text>
          <View style={{ width: 28 }} />
        </View>
        {!permission?.granted ? (
          <View style={styles.cameraPermission}>
            <Ionicons name="camera-outline" size={50} color="#D8F3E1" />
            <Text style={styles.cameraPermissionTitle}>Camera access needed</Text>
            <Text style={styles.cameraPermissionText}>Use the camera to read a package barcode or QR code, or enter one manually instead.</Text>
            <Pressable onPress={requestPermission} style={styles.primaryBtn} accessibilityRole="button" accessibilityLabel="Allow camera access for barcode scanning">
              <Text style={styles.primaryBtnText}>Allow camera</Text>
            </Pressable>
          </View>
        ) : (
          <CameraView
            style={styles.camera}
            barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e", "code128", "qr"] }}
            onBarcodeScanned={({ data, type }) => {
              if (scanInProgressRef.current) return;
              scanInProgressRef.current = true;
              setMode("start");
              if (type === "qr" || !/^\d{8,14}$/.test(data.trim())) {
                void lookupQr(data);
              } else {
                setBarcode(data);
                void lookupBarcode(data, "barcode", "camera");
              }
            }}
          >
            <View style={styles.scannerGuide}>
              <View style={styles.scannerFrame} />
              <Text style={styles.scannerHelp}>Line up a package barcode or product QR code inside the frame</Text>
            </View>
          </CameraView>
        )}
      </View>
    );
  }

  if (mode === "qr-results" && qrResult) {
    const isUrl = qrResult.kind === "url";
    const isContent = qrResult.kind === "content";
    const structuredMenu =
      qrResult.kind === "content" && qrResult.format === "json"
        ? parseStructuredQrMenu(qrResult.content)
        : null;
    const title =
      qrResult.kind === "url"
        ? "Website link scanned"
        : qrResult.kind === "content"
          ? qrResult.format === "json"
            ? "Structured QR content"
            : "Text QR content"
          : "QR code not supported";
    const description =
      qrResult.kind === "url"
        ? `This QR code links to ${qrResult.hostname}. BioTrace did not open or analyze the website automatically.`
        : qrResult.kind === "content"
          ? qrResult.summary
          : qrResult.reason;

    const openScannedUrl = async () => {
      if (!isUrl) return;
      try {
        const supported = await Linking.canOpenURL(qrResult.url);
        if (!supported) throw new Error("unsupported");
        await Linking.openURL(qrResult.url);
      } catch {
        setError("This secure link could not be opened on this device.");
      }
    };

    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPad, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <Pressable
            onPress={() => { setMode("start"); setQrResult(null); setError(null); }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Start a new BioTrace scan"
          >
            <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
            <Text style={[styles.backText, { color: c.textPrimary }]}>New scan</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          {structuredMenu && qrResult.kind === "content" ? (
            <StructuredQrMenuResult menu={structuredMenu} rawContent={qrResult.content} dark={isDark} />
          ) : (
          <View style={[styles.qrResultCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <View style={styles.qrResultHeading}>
              <View style={styles.qrResultIcon}>
                <Ionicons
                  name={isUrl ? "link-outline" : isContent ? "document-text-outline" : "information-circle-outline"}
                  size={25}
                  color={Colors.brand.primary}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.qrResultTitle, { color: c.textPrimary }]}>{title}</Text>
                <Text style={[styles.qrResultDescription, { color: c.textSecondary }]}>{description}</Text>
              </View>
            </View>

            {isUrl ? (
              <>
                <View style={[styles.qrContentBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <Text style={[styles.qrContentText, { color: c.textPrimary }]} selectable>{qrResult.url}</Text>
                </View>
                <Text style={[styles.qrSafetyText, { color: c.textMuted }]}>
                  Only continue if you recognize and trust this destination. It opens outside DiabEats.
                </Text>
                <Pressable
                  onPress={openScannedUrl}
                  style={styles.qrPrimaryAction}
                  accessibilityRole="link"
                  accessibilityLabel={`Open secure link to ${qrResult.hostname}`}
                >
                  <Ionicons name="open-outline" size={18} color="#fff" />
                  <Text style={styles.qrPrimaryActionText}>Open secure link</Text>
                </Pressable>
              </>
            ) : null}

            {isContent ? (
              <>
                <View style={[styles.qrContentBox, { backgroundColor: c.background, borderColor: c.border }]}>
                  <Text style={[styles.qrContentText, { color: c.textPrimary }]} selectable>{qrResult.content}</Text>
                </View>
                <Text style={[styles.qrSafetyText, { color: c.textMuted }]}>
                  This content came directly from the QR code. It is not verified product, nutrition, or restaurant data and was not saved.
                </Text>
              </>
            ) : null}
          </View>
          )}
          {error ? <Text style={styles.inlineError}>{error}</Text> : null}
          <Pressable
            onPress={openCamera}
            style={styles.scanAgainButton}
            accessibilityRole="button"
            accessibilityLabel="Scan another barcode or QR code"
          >
            <Ionicons name="scan-outline" size={19} color={Colors.brand.primary} />
            <Text style={styles.scanAgainText}>Scan another code</Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  if (mode === "unknown" && unknownResult) {
    return (
      <View style={[styles.container, { backgroundColor: c.background }]}>
        <View style={[styles.resultHeader, { paddingTop: topPad, backgroundColor: c.cardBg, borderBottomColor: c.border }]}>
          <Pressable
            onPress={() => { setMode("start"); setUnknownResult(null); setError(null); }}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Back to BioTrace search"
          >
            <Ionicons name="arrow-back" size={20} color={c.textPrimary} />
            <Text style={[styles.backText, { color: c.textPrimary }]}>Back</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={[styles.resultsContent, { paddingBottom: bottomPad }]} showsVerticalScrollIndicator={false}>
          <View style={[styles.unknownCard, { backgroundColor: c.cardBg, borderColor: c.border }]}>
            <Ionicons name="help-circle-outline" size={42} color={Colors.brand.cautionText} />
            <Text style={[styles.unknownTitle, { color: c.textPrimary }]}>
              {unknownResult.resolution.kind === "confirmation-required" ? "Confirm this food" : "Food not identified"}
            </Text>
            <Text style={[styles.unknownCode, { color: c.textSecondary }]} selectable>{unknownResult.identifier}</Text>
            <Text style={[styles.unknownCopy, { color: c.textSecondary }]}>{unknownResult.resolution.explanation}</Text>
            <Text style={[styles.unknownEvidence, { color: c.textMuted }]}>
              Evidence: {unknownResult.resolution.evidenceType.replace(/-/gu, " ")} · No food was guessed
            </Text>
          </View>
          <Pressable
            onPress={() => { setMode("start"); setUnknownResult(null); setError("Search for the food name, brand, or variety."); }}
            style={styles.unknownPrimaryAction}
            accessibilityRole="button"
            accessibilityLabel="Search for this food by name"
          >
            <Ionicons name="search-outline" size={18} color="#fff" />
            <Text style={styles.unknownPrimaryText}>Search by name</Text>
          </Pressable>
          <View style={styles.unknownActionRow}>
            {Platform.OS !== "web" ? (
              <Pressable onPress={takeLabelPhoto} style={[styles.unknownSecondaryAction, { borderColor: Colors.brand.primary }]} accessibilityRole="button" accessibilityLabel="Take a food label photo">
                <Ionicons name="camera-outline" size={18} color={Colors.brand.primary} />
                <Text style={styles.unknownSecondaryText}>Take photo</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={chooseLabelPhoto} style={[styles.unknownSecondaryAction, { borderColor: Colors.brand.primary }]} accessibilityRole="button" accessibilityLabel="Choose a food label photo">
              <Ionicons name="images-outline" size={18} color={Colors.brand.primary} />
              <Text style={styles.unknownSecondaryText}>Choose photo</Text>
            </Pressable>
          </View>
          <Pressable
            onPress={() => { setMode("start"); setUnknownResult(null); setBarcode(""); setError("Enter the printed PLU or full package barcode."); }}
            style={styles.scanAgainButton}
            accessibilityRole="button"
            accessibilityLabel="Enter another identifier manually"
          >
            <Ionicons name="keypad-outline" size={19} color={Colors.brand.primary} />
            <Text style={styles.scanAgainText}>Enter manually</Text>
          </Pressable>
        </ScrollView>
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
          <BioTraceResult
            product={result.product}
            rating={result.rating}
            ingredientAnalysis={result.ingredientAnalysis}
            dark={isDark}
            saved={saved}
            onSave={result.product.resolution?.kind === "generic" ? undefined : saveFood}
            onAlternatives={result.product.resolution?.kind === "generic" ? undefined : loadAlternatives}
            onReport={() => setShowReport(true)}
            onAskAssistant={
              result.product.resolution?.kind === "generic"
                ? undefined
                : () =>
                    router.push({
                      pathname: "/(tabs)/chat" as any,
                      params: {
                        biotraceBarcode: result.product.barcode ?? "",
                        biotraceProductName: result.product.name,
                      },
                    })
            }
          />
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
          <Text style={[styles.subtitle, { color: c.textSecondary }]}>Identify packaged foods and fresh-food matches without guessing from unknown codes.</Text>
        </View>

        <Pressable onPress={openCamera} style={styles.scanButton} accessibilityRole="button" accessibilityLabel="Scan a packaged food barcode or QR code" accessibilityHint="Open the barcode and QR camera">
          <Ionicons name="scan-outline" size={24} color="#fff" />
          <View style={{ flex: 1 }}><Text style={styles.scanButtonTitle}>Scan a barcode or QR code</Text><Text style={styles.scanButtonSub}>Fast verified lookup from a package</Text></View>
          <Ionicons name="arrow-forward" size={20} color="#fff" />
        </Pressable>
        {loading ? (
          <View style={styles.scanProgress} accessibilityLiveRegion="polite">
            <ActivityIndicator size="small" color={Colors.brand.primary} />
            <Text style={[styles.scanProgressText, { color: c.textSecondary }]}>Looking up the scanned product…</Text>
          </View>
        ) : null}
        {error || labelError ? (
          <View style={styles.errorBox} accessibilityLiveRegion="polite" testID="biotrace-error">
            <Ionicons name="information-circle-outline" size={18} color="#92400E" />
            <Text style={styles.errorText}>{error ?? labelError}</Text>
          </View>
        ) : null}

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Enter a barcode or printed PLU</Text>
          <View style={styles.inputRow}>
            <TextInput value={barcode} onChangeText={(text) => setBarcode(text.replace(/\D/g, "").slice(0, 14))} keyboardType="number-pad" placeholder="PLU or 8–14 digits" placeholderTextColor={c.textMuted} style={[styles.input, { color: c.textPrimary, borderColor: c.border }]} onSubmitEditing={() => lookupBarcode()} accessibilityLabel="Product barcode or printed PLU" accessibilityHint="Enter a 4 to 5 digit printed PLU or an 8 to 14 digit barcode" />
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
          {genericSearch?.kind === "product" ? (
            <Pressable
              onPress={() => {
                setResult(genericSearch.result);
                setSaved(false);
                setAlternatives([]);
                setMode("results");
              }}
              style={[styles.genericHit, { borderColor: c.border, backgroundColor: c.background }]}
              accessibilityRole="button"
              accessibilityLabel={`View generic food match for ${genericSearch.result.product.name}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.genericHitLabel, { color: Colors.brand.primary }]}>Generic food match</Text>
                <Text style={[styles.hitName, { color: c.textPrimary }]}>{genericSearch.result.product.name}</Text>
                <Text style={[styles.hitSub, { color: c.textSecondary }]}>Provider-supported name match · confirmation required</Text>
              </View>
              <Ionicons name="arrow-forward-circle-outline" size={21} color={Colors.brand.primary} />
            </Pressable>
          ) : genericSearch?.kind === "confirmation-required" ? (
            <View style={styles.genericConflict}>
              <Ionicons name="alert-circle-outline" size={18} color="#92400E" />
              <Text style={styles.genericConflictText}>{genericSearch.reason}</Text>
            </View>
          ) : null}
        </View>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={styles.labelHeader}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: c.textPrimary }]}>Label photo analysis</Text>
              <Text style={[styles.labelCopy, { color: c.textSecondary }]}>
                Scan. Understand. Choose. Photograph a nutrition facts label or ingredient list for a clear educational read.
              </Text>
            </View>
            <Ionicons name="sparkles-outline" size={22} color={Colors.brand.primary} />
          </View>
          <Text style={[styles.labelComingSoonCopy, { color: c.textMuted }]}>
            Confirm what BioTrace reads before seeing a separate educational meal-impact summary. Photos are not saved.
          </Text>
          <View style={styles.labelActions}>
            {Platform.OS !== "web" ? (
              <Pressable onPress={takeLabelPhoto} style={styles.labelPrimaryAction} accessibilityRole="button" accessibilityLabel="Take a nutrition label photo" accessibilityHint="Open the camera to photograph a package label">
                <Ionicons name="camera-outline" size={18} color="#fff" />
                <Text style={styles.labelPrimaryActionText}>Take Photo</Text>
              </Pressable>
            ) : null}
            <Pressable onPress={chooseLabelPhoto} style={[styles.labelSecondaryAction, { borderColor: Colors.brand.primary }]} accessibilityRole="button" accessibilityLabel="Choose a nutrition label photo" accessibilityHint="Choose a package label image from your device">
              <Ionicons name="images-outline" size={18} color={Colors.brand.primary} />
              <Text style={[styles.labelSecondaryActionText, { color: Colors.brand.primary }]}>{Platform.OS === "web" ? "Choose Photo" : "Choose Photo"}</Text>
            </Pressable>
          </View>
        </View>

         <View style={styles.privacyRow}><Ionicons name="shield-checkmark-outline" size={17} color={Colors.brand.primary} /><Text style={[styles.privacyText, { color: c.textSecondary }]}>Product matches come from Open Food Facts first, with USDA FoodData Central as a fallback when configured. Generic USDA foods always require confirmation. Unknown codes are never guessed. Your saved foods and scan history are private to this app session; delete them any time in Saved.</Text></View>
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
  scanProgress: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 4 },
  scanProgressText: { fontFamily: "Inter_500Medium", fontSize: 13 },
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
  genericHit: { marginTop: 12, borderWidth: 1, borderRadius: 12, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 },
  genericHitLabel: { fontFamily: "Inter_700Bold", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 3 },
  genericConflict: { marginTop: 12, flexDirection: "row", gap: 8, borderRadius: 10, padding: 10, backgroundColor: "#FEF3C7" },
  genericConflictText: { flex: 1, color: "#92400E", fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  labelHeader: { flexDirection: "row", gap: 8 },
  labelCopy: { fontFamily: "Inter_400Regular", fontSize: 12, lineHeight: 18 },
  labelComingSoonCopy: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 16, marginTop: 10 },
  labelActions: { flexDirection: "row", gap: 9, marginTop: 13 },
  labelPrimaryAction: { flex: 1, minHeight: 44, borderRadius: 11, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  labelPrimaryActionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  labelSecondaryAction: { flex: 1, minHeight: 44, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  labelSecondaryActionText: { fontFamily: "Inter_700Bold", fontSize: 13 },
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
  qrResultCard: { borderWidth: 1, borderRadius: 18, padding: 17, gap: 14 },
  qrResultHeading: { flexDirection: "row", alignItems: "flex-start", gap: 12 },
  qrResultIcon: { width: 44, height: 44, borderRadius: 14, backgroundColor: "#E8F5EC", alignItems: "center", justifyContent: "center" },
  qrResultTitle: { fontFamily: "Inter_700Bold", fontSize: 19 },
  qrResultDescription: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19, marginTop: 4 },
  qrContentBox: { borderWidth: 1, borderRadius: 12, padding: 12, maxHeight: 300 },
  qrContentText: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 19 },
  qrSafetyText: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17 },
  qrPrimaryAction: { minHeight: 46, borderRadius: 11, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  qrPrimaryActionText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  scanAgainButton: { minHeight: 46, borderRadius: 11, borderWidth: 1.5, borderColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  scanAgainText: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 14 },
  unknownCard: { borderWidth: 1, borderRadius: 18, padding: 20, alignItems: "center" },
  unknownTitle: { fontFamily: "Inter_700Bold", fontSize: 22, marginTop: 9, textAlign: "center" },
  unknownCode: { fontFamily: "Inter_600SemiBold", fontSize: 13, marginTop: 7 },
  unknownCopy: { fontFamily: "Inter_400Regular", fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 12 },
  unknownEvidence: { fontFamily: "Inter_400Regular", fontSize: 11, lineHeight: 17, textAlign: "center", marginTop: 10 },
  unknownPrimaryAction: { minHeight: 48, borderRadius: 12, backgroundColor: Colors.brand.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  unknownPrimaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 14 },
  unknownActionRow: { flexDirection: "row", gap: 9 },
  unknownSecondaryAction: { flex: 1, minHeight: 46, borderRadius: 11, borderWidth: 1.5, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7 },
  unknownSecondaryText: { color: Colors.brand.primary, fontFamily: "Inter_700Bold", fontSize: 13 },
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
  labelState: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 26, gap: 12 },
  labelPreview: { ...StyleSheet.absoluteFill, backgroundColor: "#DDEBE1", opacity: 0.45, alignItems: "center", justifyContent: "center" },
  labelPreviewText: { color: Colors.brand.primary, fontFamily: "Inter_600SemiBold", fontSize: 13 },
  labelLoadingCard: { borderWidth: 1, borderRadius: 18, padding: 25, alignItems: "center", width: "100%", maxWidth: 320 },
  labelStateTitle: { fontFamily: "Inter_700Bold", fontSize: 21, textAlign: "center", marginTop: 3 },
  labelStateCopy: { fontFamily: "Inter_400Regular", fontSize: 13, lineHeight: 20, textAlign: "center" },
  labelStatePrimary: { minHeight: 45, borderRadius: 11, backgroundColor: Colors.brand.primary, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 7, marginTop: 7 },
  labelStatePrimaryText: { color: "#fff", fontFamily: "Inter_700Bold", fontSize: 13 },
  labelBackButton: { padding: 8 },
  labelBackText: { fontFamily: "Inter_700Bold", fontSize: 13 },
});