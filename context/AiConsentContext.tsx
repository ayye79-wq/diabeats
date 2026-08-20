import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const AI_CONSENT_KEY = "@diabeats_ai_consent_v1";

interface AiConsentContextValue {
  hasConsented: boolean | null;
  consentModalVisible: boolean;
  requestConsent: () => Promise<boolean>;
  grantConsent: () => void;
  declineConsent: () => void;
}

const AiConsentContext = createContext<AiConsentContextValue | null>(null);

type ResolveRef = ((value: boolean) => void) | null;

export function AiConsentProvider({ children }: { children: ReactNode }) {
  const [hasConsented, setHasConsented] = useState<boolean | null>(null);
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const resolveRef = React.useRef<ResolveRef>(null);

  useEffect(() => {
    AsyncStorage.getItem(AI_CONSENT_KEY).then((val) => {
      setHasConsented(val === "true");
    });
  }, []);

  const requestConsent = useCallback((): Promise<boolean> => {
    if (hasConsented === true) return Promise.resolve(true);
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConsentModalVisible(true);
    });
  }, [hasConsented]);

  const grantConsent = useCallback(async () => {
    await AsyncStorage.setItem(AI_CONSENT_KEY, "true");
    setHasConsented(true);
    setConsentModalVisible(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const declineConsent = useCallback(() => {
    setConsentModalVisible(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  return (
    <AiConsentContext.Provider value={{ hasConsented, consentModalVisible, requestConsent, grantConsent, declineConsent }}>
      {children}
    </AiConsentContext.Provider>
  );
}

export function useAiConsent(): AiConsentContextValue {
  const ctx = useContext(AiConsentContext);
  if (!ctx) throw new Error("useAiConsent must be used within AiConsentProvider");
  return ctx;
}
