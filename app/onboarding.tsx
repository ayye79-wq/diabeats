import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useApp, DiabetesType, DietGoal } from "@/context/AppContext";
import Colors from "@/constants/colors";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeIn, FadeOut, SlideInRight, SlideOutLeft } from "react-native-reanimated";

type Step = 1 | 2 | 3 | 4 | 5;

export default function OnboardingScreen() {
  const { completeOnboarding, setDiabetesType, setUsesInsulin, setDailyCarbTarget, setDietGoal } = useApp();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<Step>(1);

  // Local state for choices until completion
  const [localDiabetesType, setLocalDiabetesType] = useState<DiabetesType>("type2");
  const [localUsesInsulin, setLocalUsesInsulin] = useState<boolean>(false);
  const [localCarbTarget, setLocalCarbTarget] = useState<number>(45);
  const [localDietGoal, setLocalDietGoal] = useState<DietGoal>("balanced");

  const handleNext = () => {
    if (step < 5) {
      setStep((step + 1) as Step);
    } else {
      // Finalize
      setDiabetesType(localDiabetesType);
      setUsesInsulin(localUsesInsulin);
      setDailyCarbTarget(localCarbTarget);
      setDietGoal(localDietGoal);
      completeOnboarding();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setStep((step - 1) as Step);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="restaurant" size={80} color={Colors.brand.primary} />
            </View>
            <Text style={styles.title}>Welcome to DiabEats</Text>
            <Text style={styles.description}>
              The smart way to manage your diabetes while eating out. We help you find
              diabetic-friendly meals at your favorite restaurants.
            </Text>
          </Animated.View>
        );
      case 2:
        return (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft} style={styles.stepContainer}>
            <Text style={styles.title}>What type of diabetes do you have?</Text>
            <View style={styles.optionsContainer}>
              {(["type1", "type2", "prediabetic", "gestational", null] as DiabetesType[]).map((type) => (
                <TouchableOpacity
                  key={type || "none"}
                  style={[
                    styles.optionButton,
                    localDiabetesType === type && styles.optionButtonActive,
                  ]}
                  onPress={() => setLocalDiabetesType(type)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      localDiabetesType === type && styles.optionTextActive,
                    ]}
                  >
                    {type === "type1"
                      ? "Type 1"
                      : type === "type2"
                      ? "Type 2"
                      : type === "prediabetic"
                      ? "Pre-diabetic"
                      : type === "gestational"
                      ? "Gestational"
                      : "Prefer not to say"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        );
      case 3:
        return (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft} style={styles.stepContainer}>
            <Text style={styles.title}>Do you use insulin?</Text>
            <View style={styles.optionsContainer}>
              {[
                { label: "Yes", value: true },
                { label: "No", value: false },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.optionButton,
                    localUsesInsulin === item.value && styles.optionButtonActive,
                  ]}
                  onPress={() => setLocalUsesInsulin(item.value)}
                >
                  <Text
                    style={[
                      styles.optionText,
                      localUsesInsulin === item.value && styles.optionTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        );
      case 4:
        return (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft} style={styles.stepContainer}>
            <Text style={styles.title}>What’s your daily carb target?</Text>
            <Text style={styles.subtitle}>Suggested per meal</Text>
            <View style={styles.optionsContainer}>
              {[
                { label: "Strict (<30g)", value: 25, goal: "strict" as DietGoal },
                { label: "Balanced (30-45g)", value: 45, goal: "balanced" as DietGoal },
                { label: "Relaxed (45-60g)", value: 60, goal: "weight-loss" as DietGoal },
              ].map((item) => (
                <TouchableOpacity
                  key={item.label}
                  style={[
                    styles.optionButton,
                    localCarbTarget === item.value && styles.optionButtonActive,
                  ]}
                  onPress={() => {
                    setLocalCarbTarget(item.value);
                    setLocalDietGoal(item.goal);
                  }}
                >
                  <Text
                    style={[
                      styles.optionText,
                      localCarbTarget === item.value && styles.optionTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        );
      case 5:
        return (
          <Animated.View entering={SlideInRight} exiting={SlideOutLeft} style={styles.stepContainer}>
            <View style={styles.iconContainer}>
              <Ionicons name="checkmark-circle" size={80} color={Colors.brand.good} />
            </View>
            <Text style={styles.title}>You’re all set!</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Diabetes Type</Text>
                <Text style={styles.summaryValue}>
                  {localDiabetesType ? localDiabetesType.replace("type", "Type ") : "Not specified"}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Insulin Use</Text>
                <Text style={styles.summaryValue}>{localUsesInsulin ? "Yes" : "No"}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Carb Target</Text>
                <Text style={styles.summaryValue}>{localCarbTarget}g per meal</Text>
              </View>
            </View>
            <Text style={styles.description}>
              We’ll use this information to personalize your meal recommendations.
            </Text>
            <Text style={styles.legalNote}>
              DiabEats is for informational purposes only and is not a medical device. It does not diagnose, treat, or prevent diabetes. Always consult your healthcare team before making changes to your diet or medication.
            </Text>
          </Animated.View>
        );
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom + (Platform.OS === 'web' ? 34 : 0) }]}>
      <View style={styles.header}>
        {step > 1 && (
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="chevron-back" size={24} color={Colors.brand.textPrimary} />
          </TouchableOpacity>
        )}
        <View style={styles.progressContainer}>
          {[1, 2, 3, 4, 5].map((s) => (
            <View
              key={s}
              style={[
                styles.progressBar,
                s <= step && styles.progressBarActive,
              ]}
            />
          ))}
        </View>
      </View>

      <View style={styles.content}>{renderStep()}</View>

      <View style={styles.footer}>
        <TouchableOpacity style={styles.nextButton} onPress={handleNext}>
          <Text style={styles.nextButtonText}>
            {step === 5 ? "Start Exploring" : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.brand.background,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    height: 60,
  },
  backButton: {
    marginRight: 10,
  },
  progressContainer: {
    flex: 1,
    flexDirection: "row",
    gap: 8,
  },
  progressBar: {
    flex: 1,
    height: 4,
    backgroundColor: Colors.brand.border,
    borderRadius: 2,
  },
  progressBarActive: {
    backgroundColor: Colors.brand.primary,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: "center",
  },
  stepContainer: {
    alignItems: "center",
  },
  iconContainer: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: "700",
    color: Colors.brand.textPrimary,
    textAlign: "center",
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 16,
    color: Colors.brand.textSecondary,
    marginBottom: 24,
  },
  description: {
    fontSize: 16,
    lineHeight: 24,
    color: Colors.brand.textSecondary,
    textAlign: "center",
  },
  legalNote: {
    fontSize: 11,
    lineHeight: 17,
    color: Colors.brand.textMuted,
    textAlign: "center",
    marginTop: 16,
    paddingHorizontal: 8,
    fontStyle: "italic" as const,
  },
  optionsContainer: {
    width: "100%",
    gap: 12,
  },
  optionButton: {
    width: "100%",
    padding: 18,
    borderRadius: 16,
    backgroundColor: Colors.brand.cardBg,
    borderWidth: 1,
    borderColor: Colors.brand.border,
    alignItems: "center",
  },
  optionButtonActive: {
    borderColor: Colors.brand.primary,
    backgroundColor: Colors.brand.primaryLight + "10",
  },
  optionText: {
    fontSize: 18,
    fontWeight: "600",
    color: Colors.brand.textPrimary,
  },
  optionTextActive: {
    color: Colors.brand.primary,
  },
  summaryCard: {
    width: "100%",
    padding: 20,
    borderRadius: 20,
    backgroundColor: Colors.brand.cardBg,
    borderWidth: 1,
    borderColor: Colors.brand.border,
    marginBottom: 24,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: Colors.brand.border,
  },
  summaryLabel: {
    fontSize: 16,
    color: Colors.brand.textSecondary,
  },
  summaryValue: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.brand.textPrimary,
    textTransform: "capitalize",
  },
  footer: {
    padding: 24,
  },
  nextButton: {
    backgroundColor: Colors.brand.primary,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: "center",
  },
  nextButtonText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "700",
  },
});
