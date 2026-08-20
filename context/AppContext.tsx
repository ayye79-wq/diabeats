import React, { createContext, useContext, useState, useMemo, ReactNode, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect } from "react";

type DietPreference = "none" | "low-carb" | "keto" | "mediterranean" | "diabetic-exchange";
export type DietGoal = "strict" | "balanced" | "weight-loss";
export type DiabetesType = "type1" | "type2" | "prediabetic" | "gestational" | null;

export type BloodSugarOutcome = "good" | "slight_spike" | "high_spike" | "not_measured";

export interface MealLogEntry {
  id: string;
  restaurantId: string;
  restaurantName: string;
  menuItemId: string;
  mealName: string;
  diabeticScore: "good" | "caution" | "avoid";
  carbRange: string;
  loggedAt: string;
  bloodSugarNote?: string;
  outcome?: BloodSugarOutcome;
  glucoseBefore?: number;
  glucoseAfter?: number;
  outcomeLoggedAt?: string;
}

export interface RecentlyViewedEntry {
  restaurantId: string;
  menuItemId: string;
  restaurantName: string;
  mealName: string;
  diabeticScore: "good" | "caution" | "avoid";
  carbRange: string;
  viewedAt: string;
}

interface AppContextValue {
  savedRestaurants: string[];
  savedMeals: string[];
  dietPreference: DietPreference;
  dietGoal: DietGoal;
  diabetesType: DiabetesType;
  dailyCarbTarget: number;
  usesInsulin: boolean;
  onboardingComplete: boolean;
  mealLog: MealLogEntry[];
  recentlyViewed: RecentlyViewedEntry[];
  referralCode: string;
  toggleSaveRestaurant: (id: string) => void;
  toggleSaveMeal: (id: string) => void;
  isRestaurantSaved: (id: string) => boolean;
  isMealSaved: (id: string) => boolean;
  setDietPreference: (pref: DietPreference) => void;
  setDietGoal: (goal: DietGoal) => void;
  setDiabetesType: (type: DiabetesType) => void;
  setDailyCarbTarget: (target: number) => void;
  setUsesInsulin: (uses: boolean) => void;
  completeOnboarding: () => void;
  logMeal: (entry: Omit<MealLogEntry, "id" | "loggedAt">) => void;
  removeMealLog: (id: string) => void;
  updateMealOutcome: (id: string, outcome: BloodSugarOutcome, glucoseBefore?: number, glucoseAfter?: number) => void;
  addRecentlyViewed: (entry: Omit<RecentlyViewedEntry, "viewedAt">) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

const SAVED_RESTAURANTS_KEY = "@diabeats_saved_restaurants";
const SAVED_MEALS_KEY = "@diabeats_saved_meals";
const DIET_PREF_KEY = "@diabeats_diet_pref";
const DIET_GOAL_KEY = "@diabeats_diet_goal";
const DIABETES_PROFILE_KEY = "@diabeats_diabetes_profile";
const MEAL_LOG_KEY = "@diabeats_meal_log";
const RECENTLY_VIEWED_KEY = "@diabeats_recently_viewed";
const REFERRAL_CODE_KEY = "@diabeats_referral_code";
const ONBOARDING_KEY = "@diabeats_onboarding";

export function AppProvider({ children }: { children: ReactNode }) {
  const [savedRestaurants, setSavedRestaurants] = useState<string[]>([]);
  const [savedMeals, setSavedMeals] = useState<string[]>([]);
  const [dietPreference, setDietPreferenceState] = useState<DietPreference>("none");
  const [dietGoal, setDietGoalState] = useState<DietGoal>("balanced");
  const [diabetesType, setDiabetesTypeState] = useState<DiabetesType>(null);
  const [dailyCarbTarget, setDailyCarbTargetState] = useState<number>(45);
  const [usesInsulin, setUsesInsulinState] = useState<boolean>(false);
  const [onboardingComplete, setOnboardingCompleteState] = useState<boolean>(false);
  const [mealLog, setMealLog] = useState<MealLogEntry[]>([]);
  const [recentlyViewed, setRecentlyViewed] = useState<RecentlyViewedEntry[]>([]);
  const [referralCode, setReferralCode] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const [
          restaurants,
          meals,
          diet,
          goal,
          profile,
          logs,
          recent,
          referral,
          onboarding,
        ] = await Promise.all([
          AsyncStorage.getItem(SAVED_RESTAURANTS_KEY),
          AsyncStorage.getItem(SAVED_MEALS_KEY),
          AsyncStorage.getItem(DIET_PREF_KEY),
          AsyncStorage.getItem(DIET_GOAL_KEY),
          AsyncStorage.getItem(DIABETES_PROFILE_KEY),
          AsyncStorage.getItem(MEAL_LOG_KEY),
          AsyncStorage.getItem(RECENTLY_VIEWED_KEY),
          AsyncStorage.getItem(REFERRAL_CODE_KEY),
          AsyncStorage.getItem(ONBOARDING_KEY),
        ]);

        if (restaurants) setSavedRestaurants(JSON.parse(restaurants));
        if (meals) setSavedMeals(JSON.parse(meals));
        if (diet) setDietPreferenceState(diet as DietPreference);
        if (goal) setDietGoalState(goal as DietGoal);

        if (profile) {
          const parsedProfile = JSON.parse(profile);
          if (parsedProfile.diabetesType) setDiabetesTypeState(parsedProfile.diabetesType);
          if (parsedProfile.dailyCarbTarget !== undefined) setDailyCarbTargetState(parsedProfile.dailyCarbTarget);
          if (parsedProfile.usesInsulin !== undefined) setUsesInsulinState(parsedProfile.usesInsulin);
        }

        if (logs) setMealLog(JSON.parse(logs));
        if (recent) setRecentlyViewed(JSON.parse(recent));

        if (referral) {
          setReferralCode(referral);
        } else {
          const newCode = Math.random().toString(36).substring(2, 10).toUpperCase();
          setReferralCode(newCode);
          AsyncStorage.setItem(REFERRAL_CODE_KEY, newCode).catch(() => {});
        }

        if (onboarding) setOnboardingCompleteState(JSON.parse(onboarding));
      } catch {}
    })();
  }, []);

  const toggleSaveRestaurant = useCallback((id: string) => {
    setSavedRestaurants((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(SAVED_RESTAURANTS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const toggleSaveMeal = useCallback((id: string) => {
    setSavedMeals((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      AsyncStorage.setItem(SAVED_MEALS_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const isRestaurantSaved = useCallback(
    (id: string) => savedRestaurants.includes(id),
    [savedRestaurants]
  );

  const isMealSaved = useCallback(
    (id: string) => savedMeals.includes(id),
    [savedMeals]
  );

  const setDietPreference = useCallback((pref: DietPreference) => {
    setDietPreferenceState(pref);
    AsyncStorage.setItem(DIET_PREF_KEY, pref).catch(() => {});
  }, []);

  const setDietGoal = useCallback((goal: DietGoal) => {
    setDietGoalState(goal);
    AsyncStorage.setItem(DIET_GOAL_KEY, goal).catch(() => {});
  }, []);

  const setDiabetesType = useCallback((type: DiabetesType) => {
    setDiabetesTypeState(type);
    AsyncStorage.mergeItem(
      DIABETES_PROFILE_KEY,
      JSON.stringify({ diabetesType: type })
    ).catch(() => {
      AsyncStorage.setItem(DIABETES_PROFILE_KEY, JSON.stringify({ diabetesType: type }));
    });
  }, []);

  const setDailyCarbTarget = useCallback((target: number) => {
    setDailyCarbTargetState(target);
    AsyncStorage.mergeItem(
      DIABETES_PROFILE_KEY,
      JSON.stringify({ dailyCarbTarget: target })
    ).catch(() => {
      AsyncStorage.setItem(DIABETES_PROFILE_KEY, JSON.stringify({ dailyCarbTarget: target }));
    });
  }, []);

  const setUsesInsulin = useCallback((uses: boolean) => {
    setUsesInsulinState(uses);
    AsyncStorage.mergeItem(
      DIABETES_PROFILE_KEY,
      JSON.stringify({ usesInsulin: uses })
    ).catch(() => {
      AsyncStorage.setItem(DIABETES_PROFILE_KEY, JSON.stringify({ usesInsulin: uses }));
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setOnboardingCompleteState(true);
    AsyncStorage.setItem(ONBOARDING_KEY, JSON.stringify(true)).catch(() => {});
  }, []);

  const logMeal = useCallback((entry: Omit<MealLogEntry, "id" | "loggedAt">) => {
    setMealLog((prev) => {
      const newEntry: MealLogEntry = {
        ...entry,
        id: Date.now().toString() + Math.random().toString(36).substring(2, 9),
        loggedAt: new Date().toISOString(),
      };
      const next = [newEntry, ...prev];
      AsyncStorage.setItem(MEAL_LOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const removeMealLog = useCallback((id: string) => {
    setMealLog((prev) => {
      const next = prev.filter((x) => x.id !== id);
      AsyncStorage.setItem(MEAL_LOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const updateMealOutcome = useCallback((
    id: string,
    outcome: BloodSugarOutcome,
    glucoseBefore?: number,
    glucoseAfter?: number,
  ) => {
    setMealLog((prev) => {
      const next = prev.map((entry) =>
        entry.id === id
          ? { ...entry, outcome, glucoseBefore, glucoseAfter, outcomeLoggedAt: new Date().toISOString() }
          : entry
      );
      AsyncStorage.setItem(MEAL_LOG_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const addRecentlyViewed = useCallback((entry: Omit<RecentlyViewedEntry, "viewedAt">) => {
    setRecentlyViewed((prev) => {
      const filtered = prev.filter(
        (x) => x.menuItemId !== entry.menuItemId || x.restaurantId !== entry.restaurantId
      );
      const next = [
        { ...entry, viewedAt: new Date().toISOString() },
        ...filtered,
      ].slice(0, 20);
      AsyncStorage.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
  }, []);

  const value = useMemo(
    () => ({
      savedRestaurants,
      savedMeals,
      dietPreference,
      dietGoal,
      diabetesType,
      dailyCarbTarget,
      usesInsulin,
      onboardingComplete,
      mealLog,
      recentlyViewed,
      referralCode,
      toggleSaveRestaurant,
      toggleSaveMeal,
      isRestaurantSaved,
      isMealSaved,
      setDietPreference,
      setDietGoal,
      setDiabetesType,
      setDailyCarbTarget,
      setUsesInsulin,
      completeOnboarding,
      logMeal,
      removeMealLog,
      updateMealOutcome,
      addRecentlyViewed,
    }),
    [
      savedRestaurants,
      savedMeals,
      dietPreference,
      dietGoal,
      diabetesType,
      dailyCarbTarget,
      usesInsulin,
      onboardingComplete,
      mealLog,
      recentlyViewed,
      referralCode,
      toggleSaveRestaurant,
      toggleSaveMeal,
      isRestaurantSaved,
      isMealSaved,
      setDietPreference,
      setDietGoal,
      setDiabetesType,
      setDailyCarbTarget,
      setUsesInsulin,
      completeOnboarding,
      logMeal,
      removeMealLog,
      updateMealOutcome,
      addRecentlyViewed,
    ]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
