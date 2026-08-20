import Colors from "@/constants/colors";
import type { DietGoal } from "@/context/AppContext";

export type Nutrient = { label: string; value: string };

function getNutrientValue(nutrients: Nutrient[], label: string): number {
  const n = nutrients?.find((x) => x.label === label);
  return n ? parseInt(n.value, 10) || 0 : 0;
}

export function getBloodSugarImpact(
  nutrients: Nutrient[],
  goal: DietGoal = "balanced",
  diabeticScore?: string
): {
  label: "LOW" | "MODERATE" | "HIGH";
  badgeBg: string;
  badgeText: string;
  rowBg: string;
} {
  const carbs = getNutrientValue(nutrients, "Carbs");

  const thresholds: Record<DietGoal, [number, number]> = {
    strict:      [10, 25],
    balanced:    [15, 35],
    "weight-loss": [15, 30],
  };
  const [lowMax, modMax] = thresholds[goal];

  let label: "LOW" | "MODERATE" | "HIGH";
  if (carbs <= lowMax) label = "LOW";
  else if (carbs <= modMax) label = "MODERATE";
  else label = "HIGH";

  // Align with the dietitian-reviewed diabeticScore
  if (diabeticScore === "good") label = "LOW";
  else if (diabeticScore === "caution" && label === "LOW") label = "MODERATE";
  else if (diabeticScore === "avoid") label = "HIGH";

  if (label === "LOW")
    return { label, badgeBg: Colors.brand.good,    badgeText: "#FFFFFF", rowBg: Colors.brand.goodLight };
  if (label === "MODERATE")
    return { label, badgeBg: Colors.brand.caution, badgeText: "#FFFFFF", rowBg: Colors.brand.cautionLight };
  return   { label, badgeBg: Colors.brand.avoid,   badgeText: "#FFFFFF", rowBg: Colors.brand.avoidLight };
}

export function getWhyText(nutrients: Nutrient[]): string {
  const carbs   = getNutrientValue(nutrients, "Carbs");
  const protein = getNutrientValue(nutrients, "Protein");
  const sugar   = getNutrientValue(nutrients, "Sugar");
  const fiber   = getNutrientValue(nutrients, "Fiber");

  const reasons: string[] = [];

  if (carbs > 0 && carbs < 15)       reasons.push("low carbohydrates");
  else if (carbs >= 15 && carbs < 35) reasons.push("moderate carbohydrates");
  else if (carbs >= 35)               reasons.push("high carbohydrates");

  if (protein >= 20) reasons.push("high protein");
  if (sugar <= 3)    reasons.push("minimal sugar");
  if (fiber >= 4)    reasons.push("good fiber");

  if (reasons.length === 0) return "Moderate nutritional profile";

  if (reasons.length === 1) {
    return reasons[0].charAt(0).toUpperCase() + reasons[0].slice(1);
  }
  const last = reasons.pop()!;
  return (reasons.join(", ") + " and " + last).replace(/^\w/, (c) => c.toUpperCase());
}
