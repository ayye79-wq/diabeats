import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  useFonts,
} from "@expo-google-fonts/inter";
import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import React, { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { queryClient } from "@/lib/query-client";
import { AppProvider, useApp } from "@/context/AppContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { AiConsentProvider, useAiConsent } from "@/context/AiConsentContext";
import { PaywallModal } from "@/components/PaywallModal";
import { AiConsentModal } from "@/components/AiConsentModal";
import OnboardingScreen from "./onboarding";

SplashScreen.preventAutoHideAsync();

function ConsentModalWrapper() {
  const { consentModalVisible, grantConsent, declineConsent } = useAiConsent();
  return (
    <AiConsentModal
      visible={consentModalVisible}
      onAgree={grantConsent}
      onDecline={declineConsent}
    />
  );
}

function RootLayoutNav() {
  const { onboardingComplete } = useApp();

  if (!onboardingComplete) {
    return <OnboardingScreen />;
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="restaurant/[id]"
        options={{ headerShown: false, presentation: "card" }}
      />
      <Stack.Screen
        name="meal/[restaurantId]/[itemId]"
        options={{ headerShown: false, presentation: "card" }}
      />

      <Stack.Screen
        name="log-outcome"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.65, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="safe-nearby"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.75, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="meal-simulator"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.9, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="compare"
        options={{
          presentation: "formSheet",
          sheetAllowedDetents: [0.92, 1],
          sheetGrabberVisible: true,
          headerShown: false,
          contentStyle: { backgroundColor: "transparent" },
        }}
      />
      <Stack.Screen
        name="report"
        options={{ headerShown: false, presentation: "card" }}
      />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <AppProvider>
          <SubscriptionProvider>
            <AiConsentProvider>
              <GestureHandlerRootView style={{ flex: 1 }}>
                <RootLayoutNav />
                <PaywallModal />
                <ConsentModalWrapper />
              </GestureHandlerRootView>
            </AiConsentProvider>
          </SubscriptionProvider>
        </AppProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
