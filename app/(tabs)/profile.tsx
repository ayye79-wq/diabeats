import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  useColorScheme,
  Share,
  Alert,
  TextInput,
  Linking,
  Switch,
  Modal,
  Keyboard,
  KeyboardAvoidingView,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { router } from "expo-router";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";

import Colors from "@/constants/colors";
import { useApp } from "@/context/AppContext";
import type { DietGoal, DiabetesType } from "@/context/AppContext";
import { useSubscription } from "@/context/SubscriptionContext";
import { apiRequest } from "@/lib/query-client";
import { 
  requestNotificationPermission, 
  scheduleDailyReminder, 
  cancelDailyReminder, 
  getDailyReminderStatus 
} from "@/lib/notifications";

type DietPreference = "none" | "low-carb" | "keto" | "mediterranean" | "diabetic-exchange";

const DIABETES_TYPES: { id: DiabetesType; label: string }[] = [
  { id: "type1", label: "Type 1" },
  { id: "type2", label: "Type 2" },
  { id: "prediabetic", label: "Pre-diabetic" },
  { id: "gestational", label: "Gestational" },
  { id: null, label: "Prefer not to say" },
];

const CARB_TARGET_PRESETS = [
  { label: "Strict", value: 30 },
  { label: "Balanced", value: 45 },
  { label: "Relaxed", value: 60 },
];

const GOAL_OPTIONS: {
  id: DietGoal;
  label: string;
  description: string;
  icon: string;
  thresholdNote: string;
}[] = [
  {
    id: "strict",
    label: "Strict Glucose Control",
    description: "Keep blood sugar impact low — meals over 25g carbs flagged HIGH",
    icon: "shield-checkmark-outline",
    thresholdNote: "HIGH above 25g carbs",
  },
  {
    id: "balanced",
    label: "Balanced Eating",
    description: "Standard diabetes-friendly approach — over 35g carbs flagged HIGH",
    icon: "scale-outline",
    thresholdNote: "HIGH above 35g carbs",
  },
  {
    id: "weight-loss",
    label: "Weight Loss",
    description: "Moderate carb reduction — meals over 30g carbs flagged HIGH",
    icon: "trending-down-outline",
    thresholdNote: "HIGH above 30g carbs",
  },
];

const DIET_OPTIONS: { id: DietPreference; label: string; description: string; icon: string }[] = [
  {
    id: "none",
    label: "General Guidance",
    description: "Standard diabetes-friendly recommendations",
    icon: "restaurant-outline",
  },
  {
    id: "low-carb",
    label: "Low Carb",
    description: "Prioritize meals under 30g net carbs",
    icon: "leaf-outline",
  },
  {
    id: "keto",
    label: "Ketogenic",
    description: "Strict low carb, high fat, under 20g net carbs",
    icon: "flame-outline",
  },
  {
    id: "mediterranean",
    label: "Mediterranean",
    description: "Healthy fats, whole grains, vegetables",
    icon: "sunny-outline",
  },
  {
    id: "diabetic-exchange",
    label: "Diabetic Exchange",
    description: "Balanced carbohydrate counting approach",
    icon: "swap-horizontal-outline",
  },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const isDark = useColorScheme() === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const {
    dietPreference,
    setDietPreference,
    dietGoal,
    setDietGoal,
    savedRestaurants,
    savedMeals,
    diabetesType,
    setDiabetesType,
    dailyCarbTarget,
    setDailyCarbTarget,
    usesInsulin,
    setUsesInsulin,
    mealLog,
    referralCode,
  } = useApp();
  const { isPremium, aiQuestionsToday, scansToday, AI_QUESTION_LIMIT, SCAN_LIMIT, showPaywall } = useSubscription();

  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [requestModalVisible, setRequestModalVisible] = useState(false);
  const [requestName, setRequestName] = useState("");
  const [requestCity, setRequestCity] = useState("");
  const [feedbackModalVisible, setFeedbackModalVisible] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);
  const [aboutModalVisible, setAboutModalVisible] = useState(false);

  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderTime, setReminderTime] = useState({ hour: 11, minute: 0 });

  useEffect(() => {
    const checkReminder = async () => {
      if (Platform.OS !== "web") {
        const active = await getDailyReminderStatus();
        setReminderEnabled(active);
      }
    };
    checkReminder();
  }, []);

  const handleToggleReminder = async (value: boolean) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (value) {
      const granted = await requestNotificationPermission();
      if (granted) {
        setReminderEnabled(true);
        await scheduleDailyReminder(reminderTime.hour, reminderTime.minute);
      } else {
        Alert.alert(
          "Permission Required",
          "Please enable notifications in your device settings to receive daily reminders."
        );
      }
    } else {
      setReminderEnabled(false);
      await cancelDailyReminder();
    }
  };

  const handleTimeSelect = async (hour: number) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const newTime = { hour, minute: 0 };
    setReminderTime(newTime);
    if (reminderEnabled) {
      await scheduleDailyReminder(newTime.hour, newTime.minute);
    }
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const bottomPad = Platform.OS === "web" ? 34 : 0;

  const weeklySummary = useMemo(() => {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const weekLogs = mealLog.filter(log => new Date(log.loggedAt) >= oneWeekAgo);
    
    if (weekLogs.length === 0) return null;

    const counts = { good: 0, caution: 0, avoid: 0 };
    let bestMeal = weekLogs[0];

    weekLogs.forEach(log => {
      counts[log.diabeticScore]++;
      if (log.diabeticScore === 'good' && (bestMeal.diabeticScore !== 'good')) {
        bestMeal = log;
      }
    });

    const dominant =
      counts.good >= counts.caution && counts.good >= counts.avoid ? "good" :
      counts.caution >= counts.avoid ? "caution" : "avoid";

    return {
      count: weekLogs.length,
      breakdown: counts,
      bestMeal: bestMeal.mealName,
      bestMealRestaurant: bestMeal.restaurantName,
      bestMealScore: bestMeal.diabeticScore,
      dominantScore: dominant,
    };
  }, [mealLog]);

  const handleShareReferral = async () => {
    try {
      const message = `Get 7 days of DiabEats Premium for free! Use my referral code: ${referralCode}\n\nDownload DiabEats to find diabetes-friendly restaurant options.`;
      await Share.share({ message });
    } catch {}
  };

  const handleRequestRestaurant = async () => {
    if (!requestName.trim()) {
      Alert.alert("Error", "Please enter a restaurant name");
      return;
    }

    try {
      await apiRequest("POST", "/api/request-restaurant", {
        name: requestName,
        city: requestCity,
      });
      Alert.alert("Success", "Your request has been submitted. Thank you!");
      setRequestName("");
      setRequestCity("");
      setRequestModalVisible(false);
    } catch {
      Alert.alert("Error", "Failed to submit request. Please try again later.");
    }
  };

  const handleShare = async () => {
    try {
      const message = `I use DiabEats to find diabetes-friendly restaurant options near me. It helps me make smarter meal choices when eating out!`;
      await Share.share({ message });
    } catch {}
  };

  const handleSubmitFeedback = async () => {
    if (!feedbackText.trim()) return;
    setFeedbackSubmitting(true);
    try {
      await apiRequest("POST", "/api/user-feedback", { message: feedbackText.trim() });
      setFeedbackDone(true);
      setTimeout(() => setFeedbackModalVisible(false), 2000);
    } catch {
      Alert.alert("Error", "Couldn’t send feedback. Please try again.");
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  const handleInfoPress = (title: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (title === "About DiabEats") {
      setAboutModalVisible(true);
    } else if (title === "Data Privacy") {
      Linking.openURL("https://diabeatsapp.com/privacy");
    } else if (title === "Send Feedback") {
      setFeedbackText("");
      setFeedbackDone(false);
      setFeedbackModalVisible(true);
    } else if (title === "Request a Restaurant") {
      setRequestModalVisible(true);
    }
  };

  const INFO_ITEMS = [
    {
      icon: "information-circle-outline",
      title: "About DiabEats",
      description: "Not a substitute for medical advice",
    },
    {
      icon: "shield-checkmark-outline",
      title: "Data Privacy",
      description: "View our Privacy Policy",
    },
    {
      icon: "add-circle-outline",
      title: "Request a Restaurant",
      description: "Tell us what we’re missing",
    },
    {
      icon: "mail-outline",
      title: "Send Feedback",
      description: "Help us improve the app",
    },
  ];

  const currentDiabetesLabel = DIABETES_TYPES.find(t => t.id === diabetesType)?.label || "Not set";

  return (
    <View style={[styles.container, { backgroundColor: c.background }]}>
      <Modal
        visible={feedbackModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFeedbackModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={[styles.modalContent, { backgroundColor: c.cardBg }]}>
            {feedbackDone ? (
              <>
                <View style={{ alignItems: 'center', paddingVertical: 12, gap: 10 }}>
                  <Ionicons name="checkmark-circle" size={48} color={Colors.brand.good} />
                  <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Thank you!</Text>
                  <Text style={[styles.modalDesc, { color: c.textSecondary, textAlign: 'center' }]}>
                    Your feedback has been received. We read every message and use it to improve DiabEats.
                  </Text>
                </View>
                <Pressable
                  onPress={() => setFeedbackModalVisible(false)}
                  style={[styles.modalBtn, { backgroundColor: Colors.brand.primary, marginTop: 4 }]}
                >
                  <Text style={[styles.modalBtnText, { color: '#fff' }]}>Done</Text>
                </Pressable>
              </>
            ) : (
              <>
                <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Send Feedback</Text>
                <Text style={[styles.modalDesc, { color: c.textSecondary }]}>
                  What’s working well? What could be better? We read every message.
                </Text>
                <TextInput
                  testID="feedback-input"
                  style={[
                    styles.input,
                    styles.feedbackInput,
                    { color: c.textPrimary, borderColor: feedbackText.trim() ? Colors.brand.primary : c.border, backgroundColor: c.background },
                  ]}
                  placeholder="Type your feedback here..."
                  placeholderTextColor={c.textMuted}
                  value={feedbackText}
                  onChangeText={setFeedbackText}
                  multiline
                  textAlignVertical="top"
                  autoFocus
                  blurOnSubmit={false}
                />
                <View style={styles.modalButtons}>
                  <Pressable
                    testID="feedback-cancel"
                    onPress={() => setFeedbackModalVisible(false)}
                    style={[styles.modalBtn, { backgroundColor: c.background }]}
                  >
                    <Text style={[styles.modalBtnText, { color: c.textSecondary }]}>Cancel</Text>
                  </Pressable>
                  <Pressable
                    testID="feedback-send"
                    onPress={() => { Keyboard.dismiss(); handleSubmitFeedback(); }}
                    style={[
                      styles.modalBtn,
                      { backgroundColor: feedbackText.trim() && !feedbackSubmitting ? Colors.brand.primary : c.border },
                    ]}
                  >
                    <Text style={[styles.modalBtnText, { color: '#fff' }]}>
                      {feedbackSubmitting ? 'Sending...' : 'Send'}
                    </Text>
                  </Pressable>
                </View>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={requestModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRequestModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1, justifyContent: 'center', padding: 20, backgroundColor: 'rgba(0,0,0,0.5)' }}
          behavior="padding"
          keyboardVerticalOffset={0}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={Keyboard.dismiss} />
          <View style={[styles.modalContent, { backgroundColor: c.cardBg }]}>
            <Text style={[styles.modalTitle, { color: c.textPrimary }]}>Request a Restaurant</Text>
            <Text style={[styles.modalDesc, { color: c.textSecondary }]}>Tell us which restaurant you’d like to see in DiabEats.</Text>

            <TextInput
              style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.background }]}
              placeholder="Restaurant Name"
              placeholderTextColor={c.textMuted}
              value={requestName}
              onChangeText={setRequestName}
              returnKeyType="next"
            />

            <TextInput
              style={[styles.input, { color: c.textPrimary, borderColor: c.border, backgroundColor: c.background }]}
              placeholder="City (Optional)"
              placeholderTextColor={c.textMuted}
              value={requestCity}
              onChangeText={setRequestCity}
              returnKeyType="done"
              onSubmitEditing={Keyboard.dismiss}
            />

            <View style={styles.modalButtons}>
              <Pressable
                onPress={() => setRequestModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: c.background }]}
              >
                <Text style={[styles.modalBtnText, { color: c.textSecondary }]}>Cancel</Text>
              </Pressable>
              <Pressable
                onPress={() => { Keyboard.dismiss(); handleRequestRestaurant(); }}
                style={[styles.modalBtn, { backgroundColor: Colors.brand.primary }]}
              >
                <Text style={[styles.modalBtnText, { color: "#fff" }]}>Submit</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        visible={aboutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAboutModalVisible(false)}
      >
        <Pressable
          style={{ flex: 1, justifyContent: 'center', padding: 24, backgroundColor: 'rgba(0,0,0,0.5)' }}
          onPress={() => setAboutModalVisible(false)}
        >
          <Pressable onPress={(e) => e.stopPropagation()}>
            <View style={[styles.modalContent, { backgroundColor: c.cardBg }]}>
              <View style={{ alignItems: 'center', paddingBottom: 8, gap: 10 }}>
                <Ionicons name="leaf" size={40} color={Colors.brand.primary} />
                <Text style={[styles.modalTitle, { color: c.textPrimary }]}>About DiabEats</Text>
              </View>
              <Text style={[styles.modalDesc, { color: c.textSecondary, textAlign: 'center', lineHeight: 22 }]}>
                DiabEats is your food GPS for dining out with diabetes — helping you find the safest, most satisfying meals at real restaurants.
              </Text>
              <Text style={[styles.modalDesc, { color: c.textMuted, textAlign: 'center', lineHeight: 20, fontSize: 13, marginTop: 8 }]}>
                The information provided is for educational purposes only and does not replace advice from a licensed healthcare professional.
              </Text>
              <View style={{ marginTop: 16, borderTopWidth: 1, borderTopColor: c.border, paddingTop: 14, gap: 8 }}>
                <Text style={{ fontSize: 12, fontFamily: 'Inter_600SemiBold', color: c.textSecondary, textAlign: 'center', marginBottom: 2 }}>
                  Medical Sources & References
                </Text>
                {[
                  { label: "American Diabetes Association (ADA)", url: "https://www.diabetes.org/food-nutrition" },
                  { label: "CDC — Diabetes Nutrition", url: "https://www.cdc.gov/diabetes/healthy-eating" },
                  { label: "USDA Dietary Guidelines", url: "https://www.dietaryguidelines.gov" },
                  { label: "NIH — Diabetes Diet", url: "https://www.niddk.nih.gov/health-information/diabetes/overview/diet-eating-physical-activity" },
                ].map((src) => (
                  <Pressable key={src.url} onPress={() => Linking.openURL(src.url)}>
                    <Text style={{ fontSize: 12, color: Colors.brand.primary, textAlign: 'center', textDecorationLine: 'underline', fontFamily: 'Inter_400Regular' }}>
                      {src.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable
                onPress={() => setAboutModalVisible(false)}
                style={[styles.modalBtn, { backgroundColor: Colors.brand.primary, marginTop: 12 }]}
              >
                <Text style={[styles.modalBtnText, { color: '#fff' }]}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <View
        style={[
          styles.header,
          { paddingTop: topPad + 16, backgroundColor: c.cardBg, borderBottomColor: c.border },
        ]}
      >
        <Text style={[styles.title, { color: c.textPrimary }]}>Profile</Text>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: bottomPad + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[styles.statsCard, { backgroundColor: Colors.brand.primary }]}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{savedRestaurants.length}</Text>
            <Text style={styles.statLabel}>Restaurants</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{savedMeals.length}</Text>
            <Text style={styles.statLabel}>Saved Meals</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{mealLog.length}</Text>
            <Text style={styles.statLabel}>Logs</Text>
          </View>
        </View>

        {/* Weekly Health Summary Card */}
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>WEEKLY HEALTH SUMMARY</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border, padding: 16 }]}>
          {weeklySummary ? (
            <View style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={[styles.summaryTitle, { color: c.textPrimary }]}>Weekly Health Summary</Text>
                <View style={[styles.summaryBadge, { backgroundColor: Colors.brand.goodLight }]}>
                  <Text style={[styles.summaryBadgeText, { color: Colors.brand.goodText }]}>{weeklySummary.count} meals</Text>
                </View>
              </View>

              <Text style={[{ color: c.textSecondary, fontSize: 13, lineHeight: 19, fontFamily: "Inter_400Regular" }]}>
                {weeklySummary.dominantScore === "good"
                  ? "This week most of your restaurant meals were low blood sugar impact choices."
                  : weeklySummary.dominantScore === "caution"
                  ? "Your dining choices this week were mostly moderate blood sugar impact."
                  : "Several meals this week may have higher blood sugar impact."}
              </Text>

              <View style={{ flexDirection: 'row', gap: 8 }}>
                <View style={[styles.breakdownItem, { backgroundColor: Colors.brand.goodLight }]}>
                  <Text style={[styles.breakdownValue, { color: Colors.brand.goodText }]}>{weeklySummary.breakdown.good}</Text>
                  <Text style={[styles.breakdownLabel, { color: Colors.brand.goodText }]}>Safe{"\n"}Choices</Text>
                </View>
                <View style={[styles.breakdownItem, { backgroundColor: Colors.brand.cautionLight }]}>
                  <Text style={[styles.breakdownValue, { color: Colors.brand.cautionText }]}>{weeklySummary.breakdown.caution}</Text>
                  <Text style={[styles.breakdownLabel, { color: Colors.brand.cautionText }]}>Moderate{"\n"}Impact</Text>
                </View>
                <View style={[styles.breakdownItem, { backgroundColor: Colors.brand.avoidLight }]}>
                  <Text style={[styles.breakdownValue, { color: Colors.brand.avoidText }]}>{weeklySummary.breakdown.avoid}</Text>
                  <Text style={[styles.breakdownLabel, { color: Colors.brand.avoidText }]}>Higher{"\n"}Impact</Text>
                </View>
              </View>

              <View style={[styles.bestChoiceCard, { backgroundColor: c.background }]}>
                <Ionicons name="trophy-outline" size={20} color={Colors.brand.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.bestChoiceLabel, { color: c.textSecondary }]}>Best Diabetes-Friendly Choice</Text>
                  <Text style={[styles.bestChoiceValue, { color: c.textPrimary }]} numberOfLines={1}>
                    {weeklySummary.bestMeal}
                    {weeklySummary.bestMealRestaurant ? ` — ${weeklySummary.bestMealRestaurant}` : ""}
                  </Text>
                  <Text style={{ fontFamily: "Inter_400Regular", fontSize: 11, color: Colors.brand.goodText, marginTop: 2 }}>
                    Low blood sugar impact
                  </Text>
                </View>
              </View>
            </View>
          ) : (
            <View style={{ alignItems: 'center', paddingVertical: 12, gap: 8 }}>
              <Ionicons name="calendar-outline" size={32} color={c.textMuted} />
              <Text style={[styles.summaryTitle, { color: c.textPrimary, textAlign: 'center' }]}>No meals logged yet</Text>
              <Text style={[styles.emptySummaryText, { color: c.textSecondary, textAlign: 'center' }]}>
                Start discovering diabetes-friendly dishes nearby and your weekly summary will appear here.
              </Text>
              <Pressable
                onPress={() => router.push("/")}
                style={[styles.summaryEmptyBtn, { backgroundColor: Colors.brand.primary }]}
              >
                <Ionicons name="navigate-outline" size={14} color="#fff" />
                <Text style={{ fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" }}>Find Safe Meals Near Me</Text>
              </Pressable>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>FULL REPORT</Text>
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            router.push("/report");
          }}
          style={({ pressed }) => [
            styles.card,
            {
              backgroundColor: c.cardBg,
              borderColor: c.border,
              opacity: pressed ? 0.9 : 1,
              padding: 0,
              overflow: "hidden" as const,
            },
          ]}
          testID="open-dining-report"
        >
          <View style={[styles.reportCardInner, { backgroundColor: Colors.brand.primary }]}>
            <View style={{ flex: 1 }}>
              <Text style={styles.reportCardTitle}>Weekly Health Summary</Text>
              <Text style={styles.reportCardSub}>
                {mealLog.length > 0
                  ? `${mealLog.length} meal${mealLog.length !== 1 ? "s" : ""} logged · Tap to view full breakdown`
                  : "Track your restaurant choices over time"}
              </Text>
            </View>
            <View style={styles.reportCardIcon}>
              <Ionicons name="bar-chart-outline" size={22} color="#fff" />
            </View>
          </View>
          <View style={[styles.reportCardFooter, { borderTopColor: c.border }]}>
            <View style={styles.reportStat}>
              <Text style={[styles.reportStatValue, { color: c.textPrimary }]}>
                {mealLog.filter((e) => e.diabeticScore === "good").length}
              </Text>
              <Text style={[styles.reportStatLabel, { color: c.textMuted }]}>Safe</Text>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: c.border }]} />
            <View style={styles.reportStat}>
              <Text style={[styles.reportStatValue, { color: c.textPrimary }]}>
                {mealLog.filter((e) => e.diabeticScore === "caution").length}
              </Text>
              <Text style={[styles.reportStatLabel, { color: c.textMuted }]}>Moderate</Text>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: c.border }]} />
            <View style={styles.reportStat}>
              <Text style={[styles.reportStatValue, { color: c.textPrimary }]}>
                {mealLog.filter((e) => e.diabeticScore === "avoid").length}
              </Text>
              <Text style={[styles.reportStatLabel, { color: c.textMuted }]}>High Impact</Text>
            </View>
            <View style={[styles.reportStatDivider, { backgroundColor: c.border }]} />
            <View style={styles.reportStat}>
              <Ionicons name="chevron-forward" size={16} color={Colors.brand.primary} />
              <Text style={[styles.reportStatLabel, { color: Colors.brand.primary }]}>View</Text>
            </View>
          </View>
        </Pressable>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>DIABETES PROFILE</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setIsEditingProfile(!isEditingProfile);
            }}
            style={({ pressed }) => [
              styles.optionRow,
              { opacity: pressed ? 0.8 : 1 },
            ]}
          >
            <View style={[styles.optionIcon, { backgroundColor: Colors.brand.primary + "15" }]}>
              <MaterialCommunityIcons name="diabetes" size={20} color={Colors.brand.primary} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionLabel, { color: c.textPrimary }]}>Health Profile</Text>
              <Text style={[styles.optionDesc, { color: c.textSecondary }]}>
                {currentDiabetesLabel} • {dailyCarbTarget}g carbs • {usesInsulin ? "Uses Insulin" : "No Insulin"}
              </Text>
            </View>
            <Ionicons name={isEditingProfile ? "chevron-up" : "chevron-down"} size={20} color={c.textMuted} />
          </Pressable>

          {isEditingProfile && (
            <View style={[styles.editProfileContainer, { borderTopWidth: 1, borderTopColor: c.border }]}>
              <View style={styles.editSection}>
                <Text style={[styles.editLabel, { color: c.textSecondary }]}>Diabetes Type</Text>
                <View style={styles.chipContainer}>
                  {DIABETES_TYPES.map((t) => (
                    <Pressable
                      key={String(t.id)}
                      onPress={() => setDiabetesType(t.id)}
                      style={[
                        styles.chip,
                        { backgroundColor: diabetesType === t.id ? Colors.brand.primary : c.background },
                        diabetesType === t.id && { borderColor: Colors.brand.primary }
                      ]}
                    >
                      <Text style={[styles.chipText, { color: diabetesType === t.id ? "#fff" : c.textPrimary }]}>
                        {t.label}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.editSection}>
                <Text style={[styles.editLabel, { color: c.textSecondary }]}>Daily Carb Target</Text>
                <View style={styles.chipContainer}>
                  {CARB_TARGET_PRESETS.map((p) => (
                    <Pressable
                      key={p.value}
                      onPress={() => setDailyCarbTarget(p.value)}
                      style={[
                        styles.chip,
                        { backgroundColor: dailyCarbTarget === p.value ? Colors.brand.primary : c.background },
                        dailyCarbTarget === p.value && { borderColor: Colors.brand.primary }
                      ]}
                    >
                      <Text style={[styles.chipText, { color: dailyCarbTarget === p.value ? "#fff" : c.textPrimary }]}>
                        {p.label} ({p.value}g)
                      </Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={[styles.editSection, { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
                <Text style={[styles.editLabel, { color: c.textSecondary, marginBottom: 0 }]}>Do you use insulin?</Text>
                <View style={styles.toggleContainer}>
                  <Pressable
                    onPress={() => setUsesInsulin(true)}
                    style={[
                      styles.toggleBtn,
                      usesInsulin && { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }
                    ]}
                  >
                    <Text style={[styles.toggleBtnText, { color: usesInsulin ? "#fff" : c.textPrimary }]}>Yes</Text>
                  </Pressable>
                  <Pressable
                    onPress={() => setUsesInsulin(false)}
                    style={[
                      styles.toggleBtn,
                      !usesInsulin && { backgroundColor: Colors.brand.primary, borderColor: Colors.brand.primary }
                    ]}
                  >
                    <Text style={[styles.toggleBtnText, { color: !usesInsulin ? "#fff" : c.textPrimary }]}>No</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Referral Card */}
        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>REFERRALS</Text>
        <Pressable
          style={[styles.referralCard, { backgroundColor: Colors.brand.accentLight, borderColor: Colors.brand.accent + "40" }]}
          onPress={handleShareReferral}
        >
          <View style={styles.referralHeader}>
            <View style={[styles.referralIcon, { backgroundColor: Colors.brand.accent }]}>
              <Ionicons name="gift" size={20} color="#fff" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.referralTitle, { color: Colors.brand.cautionText }]}>Give 7 Days Free</Text>
              <Text style={[styles.referralDesc, { color: Colors.brand.cautionText }]}>Share your code with a friend</Text>
            </View>
          </View>
          <View style={[styles.codeContainer, { backgroundColor: "#fff", borderColor: Colors.brand.accent + "40" }]}>
            <Text style={[styles.codeText, { color: Colors.brand.cautionText }]}>{referralCode}</Text>
            <View style={[styles.shareIconCircle, { backgroundColor: Colors.brand.accent }]}>
              <Ionicons name="share-social" size={16} color="#fff" />
            </View>
          </View>
        </Pressable>

        {isPremium ? (
          <View style={[styles.planCard, { backgroundColor: Colors.brand.goodLight, borderColor: Colors.brand.good + "60" }]}>
            <View style={styles.planCardLeft}>
              <View style={[styles.planIcon, { backgroundColor: Colors.brand.primary }]}>
                <Ionicons name="shield-checkmark" size={20} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planName, { color: Colors.brand.primary }]}>DiabEats Premium</Text>
                <Text style={[styles.planDesc, { color: Colors.brand.goodText }]}>Unlimited access to all features</Text>
              </View>
            </View>
            <Pressable
              onPress={() => Alert.alert("Manage Subscription", "Manage your subscription in your device's App Store / Play Store settings.", [
                { text: "OK" },
              ])}
            >
              <Ionicons name="settings-outline" size={20} color={Colors.brand.primary} />
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={[styles.planCard, { backgroundColor: c.cardBg, borderColor: Colors.brand.primary + "40", borderStyle: "dashed" }]}
            onPress={() => showPaywall("general")}
          >
            <View style={styles.planCardLeft}>
              <View style={[styles.planIcon, { backgroundColor: Colors.brand.primary + "15" }]}>
                <Ionicons name="shield-checkmark-outline" size={20} color={Colors.brand.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.planName, { color: c.textPrimary }]}>Free Plan</Text>
                <Text style={[styles.planDesc, { color: c.textMuted }]}>
                  {AI_QUESTION_LIMIT - aiQuestionsToday}/{AI_QUESTION_LIMIT} AI questions · {SCAN_LIMIT - scansToday}/{SCAN_LIMIT} scans remaining today
                </Text>
              </View>
            </View>
            <View style={[styles.upgradeBtn, { backgroundColor: Colors.brand.primary }]}>
              <Text style={styles.upgradeBtnText}>Go Premium</Text>
            </View>
          </Pressable>
        )}

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>YOUR GOAL</Text>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          {GOAL_OPTIONS.map((opt, i) => {
            const isSelected = dietGoal === opt.id;
            return (
              <Pressable
                key={opt.id}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setDietGoal(opt.id);
                }}
                style={({ pressed }) => [
                  styles.optionRow,
                  i < GOAL_OPTIONS.length - 1 && {
                    borderBottomWidth: 1,
                    borderBottomColor: c.border,
                  },
                  { opacity: pressed ? 0.8 : 1 },
                ]}
              >
                <View
                  style={[
                    styles.optionIcon,
                    { backgroundColor: isSelected ? Colors.brand.goodLight : c.background },
                  ]}
                >
                  <Ionicons
                    name={opt.icon as any}
                    size={18}
                    color={isSelected ? Colors.brand.primary : c.textMuted}
                  />
                </View>
                <View style={styles.optionInfo}>
                  <View style={styles.optionLabelRow}>
                    <Text style={[styles.optionLabel, { color: c.textPrimary }]}>{opt.label}</Text>
                    {isSelected && (
                      <View style={styles.activeGoalBadge}>
                        <Text style={styles.activeGoalBadgeText}>Active</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.optionDesc, { color: c.textSecondary }]}>
                    {opt.description}
                  </Text>
                  <Text style={[styles.thresholdNote, { color: c.textMuted }]}>{opt.thresholdNote}</Text>
                </View>
                {isSelected && (
                  <Ionicons name="checkmark-circle" size={20} color={Colors.brand.primary} />
                )}
              </Pressable>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>DIET PREFERENCE</Text>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          {DIET_OPTIONS.map((opt, i) => (
            <Pressable
              key={opt.id}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setDietPreference(opt.id);
              }}
              style={({ pressed }) => [
                styles.optionRow,
                i < DIET_OPTIONS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                },
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View
                style={[
                  styles.optionIcon,
                  {
                    backgroundColor:
                      dietPreference === opt.id ? Colors.brand.goodLight : c.background,
                  },
                ]}
              >
                <Ionicons
                  name={opt.icon as any}
                  size={18}
                  color={dietPreference === opt.id ? Colors.brand.primary : c.textMuted}
                />
              </View>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionLabel, { color: c.textPrimary }]}>{opt.label}</Text>
                <Text style={[styles.optionDesc, { color: c.textSecondary }]}>
                  {opt.description}
                </Text>
              </View>
              {dietPreference === opt.id && (
                <Ionicons name="checkmark-circle" size={20} color={Colors.brand.primary} />
              )}
            </Pressable>
          ))}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>HEALTH DISCLAIMER</Text>

        <View
          style={[
            styles.disclaimerCard,
            { backgroundColor: Colors.brand.cautionLight, borderColor: Colors.brand.caution },
          ]}
        >
          <Ionicons
            name="warning-outline"
            size={18}
            color={Colors.brand.cautionText}
            style={{ marginRight: 8 }}
          />
          <Text style={[styles.disclaimerText, { color: Colors.brand.cautionText }]}>
            DiabEats provides general guidance only. Always consult your healthcare team for
            personalized nutrition advice.
          </Text>
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>DAILY REMINDER</Text>
        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          <View style={[styles.optionRow, { borderBottomWidth: reminderEnabled && Platform.OS !== 'web' ? 1 : 0, borderBottomColor: c.border }]}>
            <View style={[styles.optionIcon, { backgroundColor: Colors.brand.primary + "15" }]}>
              <Ionicons name="notifications-outline" size={20} color={Colors.brand.primary} />
            </View>
            <View style={styles.optionInfo}>
              <Text style={[styles.optionLabel, { color: c.textPrimary }]}>Push Notifications</Text>
              <Text style={[styles.optionDesc, { color: c.textSecondary }]}>
                {Platform.OS === 'web' ? "Available on mobile app" : "Daily reminder to check DiabEats"}
              </Text>
            </View>
            {Platform.OS !== 'web' ? (
              <Switch
                value={reminderEnabled}
                onValueChange={handleToggleReminder}
                trackColor={{ false: c.border, true: Colors.brand.primary + "80" }}
                thumbColor={reminderEnabled ? Colors.brand.primary : "#f4f3f4"}
              />
            ) : (
              <Ionicons name="phone-portrait-outline" size={20} color={c.textMuted} />
            )}
          </View>

          {reminderEnabled && Platform.OS !== 'web' && (
            <View style={styles.timePickerContainer}>
              <Text style={[styles.timePickerLabel, { color: c.textSecondary }]}>Reminder Time</Text>
              <View style={styles.timeChips}>
                {[8, 11, 12, 14, 18].map((hour) => (
                  <Pressable
                    key={hour}
                    onPress={() => handleTimeSelect(hour)}
                    style={[
                      styles.timeChip,
                      { 
                        backgroundColor: reminderTime.hour === hour ? Colors.brand.primary : c.background,
                        borderColor: reminderTime.hour === hour ? Colors.brand.primary : c.border
                      }
                    ]}
                  >
                    <Text 
                      style={[
                        styles.timeChipText, 
                        { color: reminderTime.hour === hour ? "#fff" : c.textPrimary }
                      ]}
                    >
                      {hour === 12 ? "12 PM" : hour > 12 ? `${hour - 12} PM` : `${hour} AM`}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>
          )}
        </View>

        <Text style={[styles.sectionLabel, { color: c.textSecondary }]}>MORE</Text>

        <View style={[styles.card, { backgroundColor: c.cardBg, borderColor: c.border }]}>
          {INFO_ITEMS.map((item, i) => (
            <Pressable
              key={item.title}
              onPress={() => handleInfoPress(item.title)}
              style={({ pressed }) => [
                styles.optionRow,
                i < INFO_ITEMS.length - 1 && {
                  borderBottomWidth: 1,
                  borderBottomColor: c.border,
                },
                { opacity: pressed ? 0.8 : 1 },
              ]}
            >
              <View style={[styles.optionIcon, { backgroundColor: c.background }]}>
                <Ionicons name={item.icon as any} size={18} color={c.textMuted} />
              </View>
              <View style={styles.optionInfo}>
                <Text style={[styles.optionLabel, { color: c.textPrimary }]}>{item.title}</Text>
                <Text style={[styles.optionDesc, { color: c.textSecondary }]}>{item.description}</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={c.textMuted} />
            </Pressable>
          ))}
        </View>

        <Pressable
          onPress={handleShare}
          style={({ pressed }) => [
            styles.shareBtn,
            { opacity: pressed ? 0.85 : 1 },
          ]}
        >
          <Ionicons name="share-outline" size={18} color="#fff" />
          <Text style={styles.shareText}>Share DiabEats</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 12,
  },
  statsCard: {
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    marginBottom: 4,
  },
  statItem: {
    alignItems: "center",
    gap: 4,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 28,
    color: "#fff",
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: "rgba(255,255,255,0.7)",
  },
  statDivider: {
    width: 1,
    height: 40,
    backgroundColor: "rgba(255,255,255,0.2)",
  },
  reportCardInner: {
    flexDirection: "row" as const,
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  reportCardTitle: { fontFamily: "Inter_700Bold", fontSize: 16, color: "#fff" },
  reportCardSub: { fontFamily: "Inter_400Regular", fontSize: 12, color: "rgba(255,255,255,0.7)", marginTop: 2 },
  reportCardIcon: {
    width: 40, height: 40, borderRadius: 10,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center" as const, justifyContent: "center" as const,
  },
  reportCardFooter: {
    flexDirection: "row" as const,
    borderTopWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 0,
  },
  reportStat: { flex: 1, alignItems: "center" as const, gap: 2 },
  reportStatValue: { fontFamily: "Inter_700Bold", fontSize: 16 },
  reportStatLabel: { fontFamily: "Inter_400Regular", fontSize: 11 },
  reportStatDivider: { width: 1, height: 30, alignSelf: "center" as const },
  sectionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    letterSpacing: 0.8,
    marginTop: 8,
  },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    gap: 12,
  },
  optionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  optionInfo: {
    flex: 1,
    gap: 2,
  },
  optionLabelRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  optionLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
  },
  activeGoalBadge: {
    backgroundColor: Colors.brand.good,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  activeGoalBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 10,
    color: "#fff",
    letterSpacing: 0.3,
  },
  optionDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  thresholdNote: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    marginTop: 1,
  },
  disclaimerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    flexDirection: "row",
    alignItems: "flex-start",
  },
  disclaimerText: {
    flex: 1,
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 19,
  },
  shareBtn: {
    backgroundColor: Colors.brand.primary,
    borderRadius: 14,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 4,
  },
  shareText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: "#fff",
  },
  planCard: {
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  summaryTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  summaryBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  summaryBadgeText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  breakdownItem: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  breakdownValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
  },
  breakdownLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    marginTop: 2,
  },
  bestChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
  },
  bestChoiceLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
  },
  bestChoiceValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    marginTop: 1,
  },
  emptySummaryText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    lineHeight: 18,
  },
  summaryEmptyBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    marginTop: 4,
  },
  editProfileContainer: {
    padding: 16,
    gap: 16,
  },
  editSection: {
    gap: 8,
  },
  editLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 4,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  chipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#f0f0f0',
    borderRadius: 8,
    padding: 2,
  },
  toggleBtn: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  toggleBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
  },
  referralCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  referralHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  referralIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  referralTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
  },
  referralDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
  },
  codeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  codeText: {
    fontFamily: "Inter_700Bold",
    fontSize: 18,
    letterSpacing: 2,
  },
  shareIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalContent: {
    borderRadius: 20,
    padding: 24,
    gap: 16,
  },
  modalTitle: {
    fontFamily: "Inter_700Bold",
    fontSize: 20,
  },
  modalDesc: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    lineHeight: 20,
  },
  input: {
    height: 50,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 16,
    fontFamily: "Inter_400Regular",
  },
  feedbackInput: {
    height: 130,
    paddingTop: 14,
    paddingBottom: 14,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  modalBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
  },
  planCardLeft: { flexDirection: "row" as const, alignItems: "center" as const, gap: 12, flex: 1 },
  planIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center" as const, justifyContent: "center" as const },
  planName: { fontFamily: "Inter_700Bold", fontSize: 15 },
  planDesc: { fontFamily: "Inter_400Regular", fontSize: 12, marginTop: 2 },
  upgradeBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  upgradeBtnText: { fontFamily: "Inter_600SemiBold", fontSize: 13, color: "#fff" },
  timePickerContainer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.05)',
  },
  timePickerLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    marginBottom: 10,
  },
  timeChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  timeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
  },
  timeChipText: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
});
