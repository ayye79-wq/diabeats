import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getApiSession } from "@/lib/api-session";

export type PaywallTrigger =
  | "ai-limit"
  | "scan-limit"
  | "meal-analysis"
  | "meal-simulator"
  | "best-meal"
  | "general";

const AI_QUESTION_LIMIT = 5;
const SCAN_LIMIT = 3;
const REVENUECAT_KEY_IOS = process.env.EXPO_PUBLIC_RC_IOS_KEY?.trim() ?? "";
const REVENUECAT_KEY_ANDROID = process.env.EXPO_PUBLIC_RC_ANDROID_KEY?.trim() ?? "";

interface UsageCounts {
  aiQuestions: number;
  scans: number;
}

interface SubscriptionContextValue {
  isPremium: boolean;
  isLoading: boolean;
  aiQuestionsToday: number;
  scansToday: number;
  AI_QUESTION_LIMIT: number;
  SCAN_LIMIT: number;
  canAskAi: boolean;
  canScan: boolean;
  incrementAiQuestion: () => void;
  incrementScan: () => void;
  purchaseMonthly: () => Promise<void>;
  purchaseAnnual: () => Promise<void>;
  restorePurchases: () => Promise<void>;
  paywallVisible: boolean;
  paywallTrigger: PaywallTrigger;
  showPaywall: (trigger: PaywallTrigger) => void;
  hidePaywall: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
type PurchasesModule = typeof import("react-native-purchases");

function getPurchasesModule(): PurchasesModule | null {
  // RevenueCat is a custom native module and is not part of Expo Go. Avoid
  // loading it there so the rest of the app can run without a native bridge.
  if (Platform.OS === "web" || Constants.appOwnership === "expo") return null;

  try {
    return require("react-native-purchases") as PurchasesModule;
  } catch {
    return null;
  }
}

function getRevenueCatApiKey(): string | null {
  const key = Platform.OS === "ios" ? REVENUECAT_KEY_IOS : REVENUECAT_KEY_ANDROID;
  const expectedPrefix = Platform.OS === "ios" ? "appl_" : "goog_";
  return key.startsWith(expectedPrefix) ? key : null;
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [usage, setUsage] = useState<UsageCounts>({
    aiQuestions: 0,
    scans: 0,
  });
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<PaywallTrigger>("general");
  const rcReady = useRef(false);

  const refreshSubscription = useCallback(async () => {
    const response = await apiRequest("GET", "/api/subscription");
    const status = (await response.json()) as {
      isPremium: boolean;
      usage: { aiQuestions: number; scans: number };
    };
    setIsPremium(status.isPremium);
    setUsage(status.usage);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const baseUrl = getApiUrl();
        const session = await getApiSession(baseUrl);

        if (Platform.OS !== "web") {
          const apiKey = getRevenueCatApiKey();
          const purchasesModule = getPurchasesModule();
          if (apiKey && purchasesModule) {
            try {
              await purchasesModule.default.setLogLevel(purchasesModule.LOG_LEVEL.VERBOSE);
              purchasesModule.default.configure({
                apiKey,
                appUserID: session.revenueCatUserId,
                storeKitVersion: purchasesModule.STOREKIT_VERSION.STOREKIT_1,
              });
              rcReady.current = true;
            } catch (error) {
              console.warn("[RevenueCat] configure failed:", error);
            }
          } else if (!purchasesModule) {
            console.info("[RevenueCat] Purchases are available in a development or production build.");
          } else {
            console.warn("[RevenueCat] No API key found — purchases disabled.");
          }
        }

        await refreshSubscription();
      } catch (error) {
        console.warn("[Subscription] server status unavailable:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSubscription]);

  const incrementAiQuestion = useCallback(() => {
    setUsage((prev) => {
      return { ...prev, aiQuestions: prev.aiQuestions + 1 };
    });
  }, []);

  const incrementScan = useCallback(() => {
    setUsage((prev) => {
      return { ...prev, scans: prev.scans + 1 };
    });
  }, []);

  const showPaywall = useCallback((trigger: PaywallTrigger) => {
    setPaywallTrigger(trigger);
    setPaywallVisible(true);
  }, []);

  const hidePaywall = useCallback(() => {
    setPaywallVisible(false);
  }, []);

  const purchaseMonthly = useCallback(async () => {
    const purchasesModule = getPurchasesModule();
    if (!rcReady.current || !purchasesModule) {
      throw new Error("Purchases are not available right now. Please try again.");
    }
    try {
      const offerings = await purchasesModule.default.getOfferings();
      const pkg = offerings.current?.monthly;
      if (!pkg) throw new Error("No monthly package found");
      const product = pkg.product as unknown as { identifier?: string };
      const productId = product.identifier ?? "com.diabeats.app.premium.monthly";
      const products = await purchasesModule.default.getProducts([productId]);
      if (!products || products.length === 0) {
        throw new Error(`Product not found in App Store: ${productId}`);
      }
      await purchasesModule.default.purchaseStoreProduct(products[0]);
      await refreshSubscription();
      hidePaywall();
    } catch (e: any) {
      if (e.userCancelled) return;
      throw new Error(`${e.message}${e.underlyingErrorMessage ? " | " + e.underlyingErrorMessage : ""}`);
    }
  }, [hidePaywall, refreshSubscription]);

  const purchaseAnnual = useCallback(async () => {
    const purchasesModule = getPurchasesModule();
    if (!rcReady.current || !purchasesModule) {
      throw new Error("Purchases are not available right now. Please try again.");
    }
    try {
      const offerings = await purchasesModule.default.getOfferings();
      const pkg = offerings.current?.annual;
      if (!pkg) throw new Error("No annual package found");
      const product = pkg.product as unknown as { identifier?: string };
      const productId = product.identifier ?? "com.diabeats.app.premium.annual";
      const products = await purchasesModule.default.getProducts([productId]);
      if (!products || products.length === 0) {
        throw new Error(`Product not found in App Store: ${productId}`);
      }
      await purchasesModule.default.purchaseStoreProduct(products[0]);
      await refreshSubscription();
      hidePaywall();
    } catch (e: any) {
      if (e.userCancelled) return;
      throw new Error(`${e.message}${e.underlyingErrorMessage ? " | " + e.underlyingErrorMessage : ""}`);
    }
  }, [hidePaywall, refreshSubscription]);

  const restorePurchases = useCallback(async () => {
    const purchasesModule = getPurchasesModule();
    if (!rcReady.current || !purchasesModule) return;
    try {
      await purchasesModule.default.restorePurchases();
      await refreshSubscription();
    } catch {}
  }, [refreshSubscription]);

  const canAskAi = isPremium || usage.aiQuestions < AI_QUESTION_LIMIT;
  const canScan = isPremium || usage.scans < SCAN_LIMIT;

  return (
    <SubscriptionContext.Provider
      value={{
        isPremium,
        isLoading,
        aiQuestionsToday: usage.aiQuestions,
        scansToday: usage.scans,
        AI_QUESTION_LIMIT,
        SCAN_LIMIT,
        canAskAi,
        canScan,
        incrementAiQuestion,
        incrementScan,
        purchaseMonthly,
        purchaseAnnual,
        restorePurchases,
        paywallVisible,
        paywallTrigger,
        showPaywall,
        hidePaywall,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription(): SubscriptionContextValue {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error("useSubscription must be used within SubscriptionProvider");
  return ctx;
}
