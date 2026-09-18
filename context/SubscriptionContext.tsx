import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from "react";
import Constants, { ExecutionEnvironment } from "expo-constants";
import { Platform } from "react-native";
import { apiRequest, getApiUrl } from "@/lib/query-client";
import { getApiSession } from "@/lib/api-session";
import { trackWebEvent } from "@/lib/webAnalytics";
import { hasActiveRevenueCatEntitlement } from "@/shared/subscription";

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

export interface SubscriptionPlan {
  price: number;
  priceString: string;
  currencyCode: string | null;
  introOfferText: string | null;
}

type SubscriptionPlans = {
  monthly: SubscriptionPlan | null;
  annual: SubscriptionPlan | null;
};

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
  refreshStoreOptions: () => Promise<void>;
  subscriptionPlans: SubscriptionPlans;
  storeOptionsLoading: boolean;
  storeOptionsError: string | null;
  paywallVisible: boolean;
  paywallTrigger: PaywallTrigger;
  showPaywall: (trigger: PaywallTrigger) => void;
  hidePaywall: () => void;
}

const SubscriptionContext = createContext<SubscriptionContextValue | null>(null);
type PurchasesModule = typeof import("react-native-purchases");
const STORE_RETRY_DELAYS_MS = [0, 750, 1_500] as const;
const ACTIVATION_POLL_DELAYS_MS = [0, 750, 1_250, 2_000, 3_000, 4_000] as const;

function getPurchasesModule(): PurchasesModule | null {
  // RevenueCat is a custom native module and is not part of Expo Go. Avoid
  // loading it there so the rest of the app can run without a native bridge.
  if (
    Platform.OS === "web" ||
    Constants.appOwnership === "expo" ||
    Constants.executionEnvironment === ExecutionEnvironment.StoreClient
  ) {
    return null;
  }

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

function storeErrorText(error: unknown): string {
  if (!(error instanceof Error)) return "";
  const details = error as Error & { underlyingErrorMessage?: unknown };
  return [error.message, typeof details.underlyingErrorMessage === "string" ? details.underlyingErrorMessage : ""]
    .filter(Boolean)
    .join(" ");
}

function isRetryableStoreError(error: unknown): boolean {
  const text = storeErrorText(error).toLowerCase();
  if (!text) return true;
  if (
    text.includes("invalid api key") ||
    text.includes("configuration") ||
    text.includes("not configured") ||
    text.includes("unsupported") ||
    text.includes("not allowed")
  ) {
    return false;
  }
  return true;
}

async function retryStoreOperation<T>(operation: () => Promise<T>, attempts = STORE_RETRY_DELAYS_MS.length): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const delay = STORE_RETRY_DELAYS_MS[Math.min(attempt, STORE_RETRY_DELAYS_MS.length - 1)];
    if (delay > 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableStoreError(error)) throw error;
    }
  }
  throw lastError;
}

function friendlyStoreError(error: unknown, fallback: string): string {
  const text = storeErrorText(error);
  if (/invalid api key|not configured|configuration/i.test(text)) {
    return "This app build could not connect to its App Store purchase configuration. Please install the latest TestFlight build and try again.";
  }
  if (/network|internet|offline|timed? ?out|connection/i.test(text)) {
    return "The App Store could not be reached. Check your connection and try again.";
  }
  return fallback;
}

function subscriptionResultError(
  code: "nothing_to_restore" | "purchase_pending_activation",
  message: string,
): Error & { code: string } {
  return Object.assign(new Error(message), { code });
}

function formatTrialPeriod(period: {
  periodNumberOfUnits?: number;
  periodUnit?: string;
}): string | null {
  const count = period.periodNumberOfUnits;
  const unit = period.periodUnit?.toLowerCase().replace(/s$/u, "");
  if (!count || !unit) return null;
  return `${count}-${unit}${count === 1 ? "" : "s"}`;
}

function subscriptionPlanFromPackage(pkg: unknown): SubscriptionPlan | null {
  const product = (pkg as {
    product?: {
      price?: number;
      priceString?: string;
      currencyCode?: string;
      introPrice?: {
        price?: number;
        periodNumberOfUnits?: number;
        periodUnit?: string;
      } | null;
    };
  })?.product;

  if (
    !product ||
    typeof product.price !== "number" ||
    typeof product.priceString !== "string" ||
    product.priceString.trim().length === 0
  ) {
    return null;
  }

  const introPrice = product.introPrice;
  const trialPeriod =
    introPrice?.price === 0
      ? formatTrialPeriod({
          periodNumberOfUnits: introPrice.periodNumberOfUnits,
          periodUnit: introPrice.periodUnit,
        })
      : null;

  return {
    price: product.price,
    priceString: product.priceString,
    currencyCode: product.currencyCode ?? null,
    introOfferText: trialPeriod ? `Includes a free ${trialPeriod} trial` : null,
  };
}

export function SubscriptionProvider({ children }: { children: ReactNode }) {
  const [isPremium, setIsPremium] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [usage, setUsage] = useState<UsageCounts>({
    aiQuestions: 0,
    scans: 0,
  });
  const [subscriptionPlans, setSubscriptionPlans] = useState<SubscriptionPlans>({
    monthly: null,
    annual: null,
  });
  const [storeOptionsLoading, setStoreOptionsLoading] = useState(false);
  const [storeOptionsError, setStoreOptionsError] = useState<string | null>(null);
  const [paywallVisible, setPaywallVisible] = useState(false);
  const [paywallTrigger, setPaywallTrigger] = useState<PaywallTrigger>("general");
  const rcReady = useRef(false);
  const rcConfigurePromise = useRef<Promise<PurchasesModule> | null>(null);

  const refreshSubscription = useCallback(async (): Promise<boolean> => {
    const response = await apiRequest("GET", "/api/subscription");
    const status = (await response.json()) as {
      isPremium: boolean;
      usage: { aiQuestions: number; scans: number };
    };
    setIsPremium(status.isPremium);
    setUsage(status.usage);
    return status.isPremium;
  }, []);

  const waitForPremiumActivation = useCallback(async (): Promise<boolean> => {
    for (const delay of ACTIVATION_POLL_DELAYS_MS) {
      if (delay > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, delay));
      }
      if (await refreshSubscription()) return true;
    }
    return false;
  }, [refreshSubscription]);

  const ensureRevenueCatReady = useCallback(async (): Promise<PurchasesModule> => {
    const purchasesModule = getPurchasesModule();
    if (!purchasesModule) {
      throw new Error(
        Platform.OS === "web"
          ? "App Store purchases are available in the iOS or Android app."
          : "This app build does not include App Store purchases.",
      );
    }

    if (rcReady.current) return purchasesModule;

    const apiKey = getRevenueCatApiKey();
    if (!apiKey) {
      throw new Error("This app build is not configured for App Store purchases.");
    }

    if (!rcConfigurePromise.current) {
      rcConfigurePromise.current = (async () => {
        const session = await getApiSession(getApiUrl());
        purchasesModule.default.setLogLevel(purchasesModule.LOG_LEVEL.VERBOSE);
        purchasesModule.default.configure({
          apiKey,
          appUserID: session.revenueCatUserId,
        });
        rcReady.current = true;
        return purchasesModule;
      })();
    }

    try {
      return await rcConfigurePromise.current;
    } catch (error) {
      rcReady.current = false;
      throw error;
    } finally {
      rcConfigurePromise.current = null;
    }
  }, []);

  const refreshStoreOptions = useCallback(async () => {
    setStoreOptionsLoading(true);
    setStoreOptionsError(null);
    try {
      const purchasesModule = await ensureRevenueCatReady();
      const offerings = await retryStoreOperation(() => purchasesModule.default.getOfferings());
      const plans = {
        monthly: subscriptionPlanFromPackage(offerings.current?.monthly),
        annual: subscriptionPlanFromPackage(offerings.current?.annual),
      };
      setSubscriptionPlans(plans);
      if (!plans.monthly && !plans.annual) {
        setStoreOptionsError("The App Store did not return subscription options. Check your connection and try again.");
      }
    } catch (error) {
      console.warn("[RevenueCat] offerings unavailable:", error);
      setStoreOptionsError(
        friendlyStoreError(error, "Could not load App Store options. Please wait a moment and try again."),
      );
    } finally {
      setStoreOptionsLoading(false);
    }
  }, [ensureRevenueCatReady]);

  useEffect(() => {
    (async () => {
      try {
        if (Platform.OS !== "web") {
          await refreshStoreOptions();
        }
        await refreshSubscription();
      } catch (error) {
        console.warn("[Subscription] server status unavailable:", error);
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshStoreOptions, refreshSubscription]);

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
    trackWebEvent("paywall_viewed", { trigger });
    if (Platform.OS !== "web") {
      void refreshStoreOptions();
    }
  }, [refreshStoreOptions]);

  const hidePaywall = useCallback(() => {
    setPaywallVisible(false);
  }, []);

  const purchaseMonthly = useCallback(async () => {
    let storeTransactionCompleted = false;
    trackWebEvent("purchase_started", { plan: "monthly" });
    try {
      const purchasesModule = await ensureRevenueCatReady();
      const offerings = await retryStoreOperation(() => purchasesModule.default.getOfferings());
      const pkg = offerings.current?.monthly;
      if (!pkg) throw new Error("No monthly package found");
      const purchase = await purchasesModule.default.purchasePackage(pkg);
      storeTransactionCompleted = true;
      if (!hasActiveRevenueCatEntitlement(purchase.customerInfo)) {
        throw subscriptionResultError(
          "purchase_pending_activation",
          "Your purchase was confirmed by the App Store, but Premium is still syncing. Do not purchase again; reopen the app in a moment.",
        );
      }
      if (!(await waitForPremiumActivation())) {
        throw subscriptionResultError(
          "purchase_pending_activation",
          "Your purchase was confirmed by the App Store. Premium activation is still syncing; keep the app open briefly or reopen it in a moment.",
        );
      }
      hidePaywall();
      trackWebEvent("purchase_completed", { plan: "monthly" });
    } catch (e: any) {
      if (e.userCancelled) {
        trackWebEvent("purchase_cancelled", { plan: "monthly" });
        return;
      }
      if (storeTransactionCompleted || e.code === "purchase_pending_activation") {
        hidePaywall();
        trackWebEvent("purchase_pending", { plan: "monthly" });
        throw subscriptionResultError(
          "purchase_pending_activation",
          e.code === "purchase_pending_activation"
            ? e.message
            : "Your purchase was confirmed by the App Store. Premium activation could not be checked yet; do not purchase again. Reopen the app in a moment.",
        );
      }
      trackWebEvent("purchase_failed", { plan: "monthly" });
      throw new Error(friendlyStoreError(e, e.message ?? "The purchase could not be completed. Please try again."));
    }
  }, [ensureRevenueCatReady, hidePaywall, waitForPremiumActivation]);

  const purchaseAnnual = useCallback(async () => {
    let storeTransactionCompleted = false;
    trackWebEvent("purchase_started", { plan: "annual" });
    try {
      const purchasesModule = await ensureRevenueCatReady();
      const offerings = await retryStoreOperation(() => purchasesModule.default.getOfferings());
      const pkg = offerings.current?.annual;
      if (!pkg) throw new Error("No annual package found");
      const purchase = await purchasesModule.default.purchasePackage(pkg);
      storeTransactionCompleted = true;
      if (!hasActiveRevenueCatEntitlement(purchase.customerInfo)) {
        throw subscriptionResultError(
          "purchase_pending_activation",
          "Your purchase was confirmed by the App Store, but Premium is still syncing. Do not purchase again; reopen the app in a moment.",
        );
      }
      if (!(await waitForPremiumActivation())) {
        throw subscriptionResultError(
          "purchase_pending_activation",
          "Your purchase was confirmed by the App Store. Premium activation is still syncing; keep the app open briefly or reopen it in a moment.",
        );
      }
      hidePaywall();
      trackWebEvent("purchase_completed", { plan: "annual" });
    } catch (e: any) {
      if (e.userCancelled) {
        trackWebEvent("purchase_cancelled", { plan: "annual" });
        return;
      }
      if (storeTransactionCompleted || e.code === "purchase_pending_activation") {
        hidePaywall();
        trackWebEvent("purchase_pending", { plan: "annual" });
        throw subscriptionResultError(
          "purchase_pending_activation",
          e.code === "purchase_pending_activation"
            ? e.message
            : "Your purchase was confirmed by the App Store. Premium activation could not be checked yet; do not purchase again. Reopen the app in a moment.",
        );
      }
      trackWebEvent("purchase_failed", { plan: "annual" });
      throw new Error(friendlyStoreError(e, e.message ?? "The purchase could not be completed. Please try again."));
    }
  }, [ensureRevenueCatReady, hidePaywall, waitForPremiumActivation]);

  const restorePurchases = useCallback(async () => {
    trackWebEvent("restore_started");
    try {
      const purchasesModule = await ensureRevenueCatReady();
      const customerInfo = await retryStoreOperation(() => purchasesModule.default.restorePurchases());
      if (!hasActiveRevenueCatEntitlement(customerInfo)) {
        throw subscriptionResultError(
          "nothing_to_restore",
          "No active DiabEats Premium purchase was found for this App Store account.",
        );
      }
      if (!(await waitForPremiumActivation())) {
        throw subscriptionResultError(
          "purchase_pending_activation",
          "Your Premium purchase was found. Account activation is still syncing; keep the app open briefly or reopen it in a moment.",
        );
      }
      trackWebEvent("restore_completed");
    } catch (error) {
      if (
        error instanceof Error &&
        "code" in error &&
        (error.code === "nothing_to_restore" || error.code === "purchase_pending_activation")
      ) {
        trackWebEvent("restore_failed", {
          outcome: error.code === "nothing_to_restore" ? "nothing_to_restore" : "pending",
        });
        throw error;
      }
      trackWebEvent("restore_failed", { outcome: "error" });
      throw new Error(
        friendlyStoreError(error, "The App Store could not restore purchases. Please wait a moment and try again."),
      );
    }
  }, [ensureRevenueCatReady, waitForPremiumActivation]);

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
        refreshStoreOptions,
        subscriptionPlans,
        storeOptionsLoading,
        storeOptionsError,
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
