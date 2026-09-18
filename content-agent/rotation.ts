import path from "node:path";

export const ROTATION_HISTORY_LIMIT = 8;

const generatedImages = path.resolve(process.cwd(), "attached_assets/generated_images");
const burgerSaladMenu = path.join(generatedImages, "diabeats-v4-burger-salad-menu.jpg");
const tacoBowlFajitas = path.join(generatedImages, "diabeats-v4-taco-bowl-fajitas.jpg");
const pastaSalmonVegetables = path.join(generatedImages, "diabeats-v4-pasta-salmon-vegetables.jpg");
const breakfastSandwichOmelet = path.join(generatedImages, "diabeats-v4-breakfast-sandwich-omelet.jpg");
const pizzaVegetableChicken = path.join(generatedImages, "diabeats-v4-pizza-vegetable-chicken.jpg");
const noodleTofuVegetables = path.join(generatedImages, "diabeats-v4-noodle-tofu-vegetables.jpg");
const sandwichChiliSide = path.join(generatedImages, "diabeats-v4-sandwich-chili-side.jpg");
const burgerWrapFruit = path.join(generatedImages, "diabeats-v4-burger-wrap-fruit.jpg");
const riceCurryGreens = path.join(generatedImages, "diabeats-v4-rice-curry-greens.jpg");
const bagelYogurtEggs = path.join(generatedImages, "diabeats-v4-bagel-yogurt-eggs.jpg");
const macCheeseGreens = path.join(generatedImages, "diabeats-v4-mac-cheese-greens.jpg");
const sushiTempuraSashimi = path.join(generatedImages, "diabeats-v4-sushi-tempura-sashimi.jpg");

export type ContentRotationPackage = {
  id: string;
  mealConcept: string;
  nutritionExample: string;
  hook: string;
  imageSetId: string;
  assetPaths: string[];
  requiredTerms: string[];
};

/**
 * Curated copy and image combinations keep the model medically cautious while
 * making each scheduled draft recognizably different. The image sets use only
 * checked-in, approved meal photography; each pairing has a dedicated asset
 * so the visuals stay aligned with the nutrition example. Stable IDs are
 * persisted so a workflow run can exclude a complete combination, not just
 * its topic.
 */
export const CONTENT_ROTATION_PACKAGES: readonly ContentRotationPackage[] = [
  {
    id: "burger-salad-menu",
    mealConcept: "burger, fries, and soda versus grilled chicken salad and water",
    nutritionExample: "Example: 96g carbs for the burger meal versus 28g carbs for the salad meal.",
    hook: "Before ordering, compare the whole meal",
    imageSetId: "v4-meal-pairing-burger-salad",
    assetPaths: [burgerSaladMenu],
    requiredTerms: ["burger", "salad", "96g", "28g"],
  },
  {
    id: "taco-bowl-fajitas",
    mealConcept: "a rice-and-bean burrito bowl versus fajitas with vegetables",
    nutritionExample: "Example: 78g carbs for the rice-and-bean bowl versus 42g carbs for the fajita plate.",
    hook: "What changes when the sides change?",
    imageSetId: "v4-meal-pairing-taco-fajitas",
    assetPaths: [tacoBowlFajitas],
    requiredTerms: ["rice-and-bean", "fajita", "78g", "42g"],
  },
  {
    id: "pasta-salmon-vegetables",
    mealConcept: "a creamy pasta entrée versus salmon with non-starchy vegetables",
    nutritionExample: "Example: 82g carbs for the pasta entrée versus 24g carbs for salmon and vegetables.",
    hook: "Scan the entree, sides, and drink",
    imageSetId: "v4-meal-pairing-pasta-salmon",
    assetPaths: [pastaSalmonVegetables],
    requiredTerms: ["pasta", "salmon", "82g", "24g"],
  },
  {
    id: "breakfast-sandwich-omelet",
    mealConcept: "a breakfast sandwich with hash browns versus a vegetable omelet with berries",
    nutritionExample: "Example: 64g carbs for the breakfast sandwich meal versus 22g carbs for the omelet meal.",
    hook: "A breakfast swap worth checking first",
    imageSetId: "v4-meal-pairing-breakfast-omelet",
    assetPaths: [breakfastSandwichOmelet],
    requiredTerms: ["breakfast sandwich", "omelet", "64g", "22g"],
  },
  {
    id: "pizza-vegetable-chicken",
    mealConcept: "two slices of pizza with a sugary drink versus chicken with vegetables",
    nutritionExample: "Example: 88g carbs for the pizza and drink versus 30g carbs for chicken and vegetables.",
    hook: "The drink can change the comparison",
    imageSetId: "v4-meal-pairing-pizza-chicken",
    assetPaths: [pizzaVegetableChicken],
    requiredTerms: ["pizza", "chicken", "88g", "30g"],
  },
  {
    id: "noodle-tofu-vegetables",
    mealConcept: "a noodle bowl versus tofu with vegetables and a measured sauce",
    nutritionExample: "Example: 74g carbs for the noodle bowl versus 32g carbs for tofu and vegetables.",
    hook: "Check the bowl, sauce, and serving",
    imageSetId: "v4-meal-pairing-noodle-tofu",
    assetPaths: [noodleTofuVegetables],
    requiredTerms: ["noodle", "tofu", "74g", "32g"],
  },
  {
    id: "sandwich-chili-side",
    mealConcept: "a deli sandwich with chips versus chili with a side salad",
    nutritionExample: "Example: 70g carbs for the sandwich meal versus 36g carbs for chili and salad.",
    hook: "Compare the side, not just the entree",
    imageSetId: "v4-meal-pairing-sandwich-chili",
    assetPaths: [sandwichChiliSide],
    requiredTerms: ["sandwich", "chili", "70g", "36g"],
  },
  {
    id: "burger-wrap-fruit",
    mealConcept: "a burger with fries versus a grilled chicken wrap with fruit",
    nutritionExample: "Example: 91g carbs for the burger meal versus 46g carbs for the chicken wrap meal.",
    hook: "Look at every part of the meal",
    imageSetId: "v4-meal-pairing-burger-wrap",
    assetPaths: [burgerWrapFruit],
    requiredTerms: ["burger", "chicken wrap", "91g", "46g"],
  },
  {
    id: "rice-curry-greens",
    mealConcept: "a curry with a full rice serving versus curry with greens and a smaller rice serving",
    nutritionExample: "Example: 86g carbs for the full rice serving versus 48g carbs for the greens and rice option.",
    hook: "Serving size changes the example",
    imageSetId: "v4-meal-pairing-curry-rice",
    assetPaths: [riceCurryGreens],
    requiredTerms: ["curry", "rice", "86g", "48g"],
  },
  {
    id: "bagel-yogurt-eggs",
    mealConcept: "a large bagel breakfast versus eggs with plain yogurt and fruit",
    nutritionExample: "Example: 68g carbs for the bagel breakfast versus 34g carbs for eggs, yogurt, and fruit.",
    hook: "Compare the breakfast portions",
    imageSetId: "v4-meal-pairing-bagel-eggs",
    assetPaths: [bagelYogurtEggs],
    requiredTerms: ["bagel", "eggs", "68g", "34g"],
  },
  {
    id: "mac-cheese-greens",
    mealConcept: "a mac and cheese entrée versus roasted chicken with greens",
    nutritionExample: "Example: 79g carbs for mac and cheese versus 27g carbs for chicken and greens.",
    hook: "One menu, two useful comparisons",
    imageSetId: "v4-meal-pairing-mac-chicken",
    assetPaths: [macCheeseGreens],
    requiredTerms: ["mac and cheese", "chicken", "79g", "27g"],
  },
  {
    id: "sushi-tempura-sashimi",
    mealConcept: "a tempura sushi roll meal versus sashimi with edamame",
    nutritionExample: "Example: 61g carbs for the tempura roll meal versus 18g carbs for sashimi and edamame.",
    hook: "Check what is fried and what is rolled",
    imageSetId: "v4-meal-pairing-sushi-sashimi",
    assetPaths: [sushiTempuraSashimi],
    requiredTerms: ["tempura", "sashimi", "61g", "18g"],
  },
];

export function canonicalizeRotationPackageIds(packageIds: readonly unknown[]): string[] {
  const knownIds = new Set(CONTENT_ROTATION_PACKAGES.map((rotationPackage) => rotationPackage.id));
  const seen = new Set<string>();
  const recent: string[] = [];
  for (const packageId of packageIds) {
    if (
      typeof packageId === "string"
      && knownIds.has(packageId)
      && !seen.has(packageId)
    ) {
      recent.push(packageId);
      seen.add(packageId);
    }
    if (recent.length === ROTATION_HISTORY_LIMIT) break;
  }
  return recent;
}

export function selectRotationPackage(recentPackageIds: readonly string[]): ContentRotationPackage {
  const recentIds = canonicalizeRotationPackageIds(recentPackageIds);
  const recent = new Set(recentIds);
  const mostRecentIndex = recentIds.length
    ? CONTENT_ROTATION_PACKAGES.findIndex((candidate) => candidate.id === recentIds[0])
    : -1;
  const startIndex = mostRecentIndex >= 0
    ? (mostRecentIndex + 1) % CONTENT_ROTATION_PACKAGES.length
    : 0;
  const selected = Array.from(
    { length: CONTENT_ROTATION_PACKAGES.length },
    (_, offset) => CONTENT_ROTATION_PACKAGES[(startIndex + offset) % CONTENT_ROTATION_PACKAGES.length],
  ).find((candidate) => candidate && !recent.has(candidate.id));
  if (!selected) {
    throw new Error(
      `No unused content rotation package is available in the ${ROTATION_HISTORY_LIMIT}-run history window.`,
    );
  }
  return selected;
}

export function rotationPackageForId(id: string): ContentRotationPackage {
  const selected = CONTENT_ROTATION_PACKAGES.find((candidate) => candidate.id === id);
  if (!selected) throw new Error(`Unknown content rotation package: ${id}`);
  return selected;
}

export function validateRotationPackage(
  content: { hook: string; voiceover: string; scenes: Array<{ onScreenText: string }>; caption: string; rotationPackageId?: string },
  rotationPackage: ContentRotationPackage,
): string[] {
  const text = [content.hook, content.voiceover, ...content.scenes.map((scene) => scene.onScreenText), content.caption]
    .join(" ")
    .toLowerCase();
  const errors: string[] = [];
  if (content.rotationPackageId && content.rotationPackageId !== rotationPackage.id) {
    errors.push(`Rotation package ID must be ${rotationPackage.id}`);
  }
  if (content.hook !== rotationPackage.hook) {
    errors.push(`Use the selected rotation hook exactly: ${rotationPackage.hook}`);
  }
  for (const term of rotationPackage.requiredTerms) {
    if (!text.includes(term.toLowerCase())) errors.push(`Rotation package is missing required example detail: ${term}`);
  }
  return errors;
}