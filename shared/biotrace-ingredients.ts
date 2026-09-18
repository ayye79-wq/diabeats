import { z } from "zod";

/**
 * BioTrace ingredient-analysis engine.
 *
 * This is the single deterministic engine that explains what is actually in a
 * scanned product's ingredient list — not just its score. It is used
 * uniformly by every BioTrace entry point (barcode scan, QR scan, name
 * search-then-lookup, and label photo scan) so all four converge on the same
 * explanations instead of running separate pipelines.
 *
 * Consistent with the rest of BioTrace's verified-product flow, this engine is
 * intentionally rules-based (no AI/LLM call): every explanation comes from a
 * curated, reviewed reference table, not generated text. That keeps it fast,
 * free of hallucination risk, and — per the "never invent" principle already
 * used for nutrition and GMO data — honest about what it does not recognize
 * rather than guessing. GMO status stays fully out of scope here; that
 * evidence-based logic lives only in server/services/open-food-facts.ts.
 */

const trimmed = (max: number) => z.string().trim().min(1).max(max);

// ---------------------------------------------------------------------------
// Categories & blood-sugar relevance
// ---------------------------------------------------------------------------

export const ingredientCategorySchema = z.enum([
  "recognized-sugar",
  "syrup",
  "refined-starch",
  "maltodextrin",
  "sugar-alcohol",
  "artificial-sweetener",
  "novel-sweetener",
  "fiber",
  "protein-or-fat",
  "preservative",
  "color",
  "flavor-enhancer",
  "texture-agent",
  "acid-regulator",
  "leavening-agent",
  "vitamin-or-mineral",
  "flavoring-or-base",
  "unclassified",
]);

export type IngredientCategory = z.infer<typeof ingredientCategorySchema>;

export const bloodSugarRelevanceSchema = z.enum(["direct", "indirect", "minimal", "unknown"]);
export type BloodSugarRelevance = z.infer<typeof bloodSugarRelevanceSchema>;

/** Categories that represent an added sweetener of some kind. */
export const SWEETENER_CATEGORIES: ReadonlySet<IngredientCategory> = new Set([
  "recognized-sugar",
  "syrup",
  "maltodextrin",
  "sugar-alcohol",
  "artificial-sweetener",
  "novel-sweetener",
]);

/** Categories that represent a non-sweetener functional additive. */
export const ADDITIVE_CATEGORIES: ReadonlySet<IngredientCategory> = new Set([
  "preservative",
  "color",
  "flavor-enhancer",
  "texture-agent",
  "acid-regulator",
  "leavening-agent",
  "vitamin-or-mineral",
]);

// ---------------------------------------------------------------------------
// Output contract
// ---------------------------------------------------------------------------

export const ingredientExplanationSchema = z
  .object({
    /** The ingredient exactly as it appears in the product's ingredient text. */
    name: trimmed(140),
    category: ingredientCategorySchema,
    /** Plain-language explanation of what this ingredient actually is. */
    explanation: trimmed(320),
    bloodSugarRelevance: bloodSugarRelevanceSchema,
    /** Present only when the ingredient has some blood-sugar relevance. */
    bloodSugarNote: trimmed(320).nullable(),
  })
  .strict();

export type IngredientExplanation = z.infer<typeof ingredientExplanationSchema>;

export const ingredientAnalysisSchema = z
  .object({
    /** Every recognized top-level and sub-ingredient, explained in order. */
    ingredients: z.array(ingredientExplanationSchema).max(120),
    /** Sweeteners specifically, named individually with why they matter. */
    sweeteners: z.array(ingredientExplanationSchema).max(40),
    /** Non-sweetener functional additives, named individually. */
    additives: z.array(ingredientExplanationSchema).max(60),
    /** Count of ingredients BioTrace could not classify (never invented). */
    unclassifiedCount: z.number().int().nonnegative(),
    /** One-sentence, deterministic roll-up of the analysis above. */
    summary: trimmed(400),
    /** The exact ingredient text this analysis was derived from, if any. */
    sourceText: z.string().trim().max(8_000).nullable(),
  })
  .strict();

export type IngredientAnalysis = z.infer<typeof ingredientAnalysisSchema>;

export const INGREDIENT_ANALYSIS_DISCLAIMER =
  "Ingredient explanations are educational and rules-based, drawn from a reference list — not personalized medical advice. Individual responses to any ingredient can vary.";

// ---------------------------------------------------------------------------
// Reference dictionary
// ---------------------------------------------------------------------------

type DictionaryEntry = {
  /** Multi-word terms should come before the shorter terms they contain. */
  terms: string[];
  category: IngredientCategory;
  explanation: (name: string) => string;
  relevance: BloodSugarRelevance;
  note?: (name: string) => string;
};

const DICTIONARY: DictionaryEntry[] = [
  // --- Sugars & syrups (direct) --------------------------------------------
  {
    terms: ["high fructose corn syrup", "high-fructose corn syrup"],
    category: "syrup",
    explanation: () => "A corn-derived liquid sweetener that is roughly half glucose and half fructose.",
    relevance: "direct",
    note: () => "A concentrated added sugar; it raises blood sugar similarly to table sugar.",
  },
  {
    terms: ["corn syrup", "cane syrup", "rice syrup", "brown rice syrup", "maple syrup", "golden syrup", "malt syrup", "invert sugar", "agave syrup", "agave nectar"],
    category: "syrup",
    explanation: (name) => `${name} is a liquid sweetener made by processing a plant source (corn, cane, rice, maple, or agave) into concentrated sugars.`,
    relevance: "direct",
    note: () => "A concentrated added sugar that raises blood sugar; some syrups (like agave) are especially high in fructose.",
  },
  {
    terms: ["cane sugar", "granulated sugar", "brown sugar", "powdered sugar", "confectioners sugar", "raw sugar", "turbinado sugar", "coconut sugar", "date sugar", "beet sugar"],
    category: "recognized-sugar",
    explanation: (name) => `${name} is a form of table sugar (sucrose) from a plant source.`,
    relevance: "direct",
    note: () => "A simple carbohydrate that digests quickly and raises blood sugar; check the label's total and added sugars.",
  },
  {
    terms: ["sugar", "sucrose", "sucre", "saccharose", "zucker", "azúcar", "sacarosa"],
    category: "recognized-sugar",
    explanation: () => "Table sugar (sucrose), a simple carbohydrate made of glucose and fructose.",
    relevance: "direct",
    note: () => "Digests quickly and raises blood sugar; check the label's total and added sugars.",
  },
  {
    terms: ["dextrose", "glucose", "glucose syrup", "sirop de glucose", "glukosesirup", "jarabe de glucosa"],
    category: "recognized-sugar",
    explanation: (name) => `${name} is essentially pure glucose, the sugar the body uses directly for energy.`,
    relevance: "direct",
    note: () => "Raises blood sugar quickly since it is glucose itself, with no digestion step needed.",
  },
  {
    terms: ["fructose", "crystalline fructose"],
    category: "recognized-sugar",
    explanation: () => "A simple sugar found naturally in fruit; here it is added as a concentrated sweetener.",
    relevance: "direct",
    note: () => "Still an added sugar; it raises blood sugar more slowly than glucose but contributes to total sugars.",
  },
  {
    terms: ["maltose"],
    category: "recognized-sugar",
    explanation: () => "A sugar made of two linked glucose units, often from malted grain.",
    relevance: "direct",
    note: () => "Breaks down into glucose quickly and raises blood sugar similarly to table sugar.",
  },
  {
    terms: ["honey"],
    category: "recognized-sugar",
    explanation: () => "A natural sweetener made mostly of glucose and fructose.",
    relevance: "direct",
    note: () => "Despite being natural, it affects blood sugar much like table sugar.",
  },
  {
    terms: ["molasses"],
    category: "recognized-sugar",
    explanation: () => "A thick syrup left over from refining sugar cane or beets into sugar.",
    relevance: "direct",
    note: () => "Still a concentrated sugar source that raises blood sugar.",
  },

  // --- Starches (indirect) --------------------------------------------------
  {
    terms: ["maltodextrin", "maltodextrine", "maltodextrina"],
    category: "maltodextrin",
    explanation: () => "A highly processed carbohydrate made by partially breaking down starch (usually corn, rice, or potato).",
    relevance: "direct",
    note: () => "Despite not tasting sweet, it digests almost as fast as pure sugar and can raise blood sugar quickly.",
  },
  {
    terms: ["whole wheat flour", "whole grain flour", "whole grain oats", "whole oats", "wheat", "oats", "barley", "rye"],
    category: "refined-starch",
    explanation: (name) => `${name} is a grain that has been milled while keeping the bran and germ.`,
    relevance: "indirect",
    note: () => "Still contributes digestible carbohydrate, but its retained fiber tends to slow glucose absorption compared with refined versions.",
  },
  {
    terms: ["modified food starch", "modified corn starch", "modified tapioca starch", "modified potato starch", "corn starch", "potato starch", "tapioca starch", "wheat starch", "rice starch", "rice flour", "white flour", "enriched flour", "refined flour", "enriched wheat flour", "bleached flour", "wheat flour", "farine de blé", "amidon de maïs", "weizenmehl", "maisstärke", "kartoffelstärke", "harina de trigo", "almidón de maíz"],
    category: "refined-starch",
    explanation: (name) => `${name} is a refined starch or flour used to thicken, bind, or bulk the product.`,
    relevance: "indirect",
    note: () => "Contributes digestible carbohydrate; refining removes the fiber that would otherwise slow glucose absorption.",
  },

  // --- Sugar alcohols (indirect, but distinguish higher-impact ones) --------
  {
    terms: ["maltitol"],
    category: "sugar-alcohol",
    explanation: () => "A sugar alcohol (sweetener) derived from maltose.",
    relevance: "indirect",
    note: () => "Among sugar alcohols, maltitol has one of the larger effects on blood sugar — noticeably more than erythritol or xylitol.",
  },
  {
    terms: ["erythritol", "xylitol", "sorbitol", "mannitol", "isomalt", "lactitol"],
    category: "sugar-alcohol",
    explanation: (name) => `${name} is a sugar alcohol — a reduced-calorie sweetener that is only partially absorbed by the body.`,
    relevance: "indirect",
    note: () => "Typically has a smaller effect on blood sugar than sugar, though this can vary by person and by amount consumed.",
  },

  // --- Artificial & novel sweeteners -----------------------------------------
  {
    terms: ["aspartame", "sucralose", "saccharin", "acesulfame potassium", "acesulfame-k", "acesulfame k", "neotame", "advantame", "cyclamate"],
    category: "artificial-sweetener",
    explanation: (name) => `${name} is a zero- or very-low-calorie artificial sweetener.`,
    relevance: "indirect",
    note: () => "Does not directly supply carbohydrate the way sugar does; research on longer-term metabolic effects is ongoing, so effects can vary by person.",
  },
  {
    terms: ["stevia", "steviol glycosides", "glycosides de stéviol", "steviolglycoside", "glucósidos de esteviol", "monk fruit", "monk fruit extract", "luo han guo"],
    category: "novel-sweetener",
    explanation: (name) => `${name} is a plant-derived, non-nutritive sweetener.`,
    relevance: "minimal",
    note: () => "Provides sweetness without significant calories or carbohydrate and does not directly raise blood sugar.",
  },

  // --- Fiber ----------------------------------------------------------------
  {
    terms: ["chicory root fiber", "chicory root extract", "soluble corn fiber", "resistant starch", "psyllium husk", "psyllium", "oat fiber", "wheat bran", "polydextrose"],
    category: "fiber",
    explanation: (name) => `${name} is an added fiber ingredient.`,
    relevance: "indirect",
    note: () => "Fiber is not digested for energy the way sugar is, and can help slow the absorption of other carbohydrates in the product.",
  },
  {
    terms: ["inulin"],
    category: "fiber",
    explanation: () => "A plant fiber, often from chicory root, used to add fiber or a mild sweetness.",
    relevance: "indirect",
    note: () => "Not digested for energy the way sugar is, and can help slow absorption of other carbohydrates.",
  },
  {
    terms: ["cellulose", "cellulose gum", "microcrystalline cellulose"],
    category: "fiber",
    explanation: (name) => `${name} is a plant-fiber ingredient used to add texture or bulk.`,
    relevance: "minimal",
    note: () => "Provides negligible digestible carbohydrate.",
  },

  // --- Preservatives ----------------------------------------------------------
  {
    terms: ["sodium benzoate", "benzoate de sodium", "natriumbenzoat", "benzoato de sodio", "potassium sorbate", "sorbate de potassium", "kaliumsorbat", "sorbato de potasio", "calcium propionate", "sodium nitrite", "nitrite de sodium", "natriumnitrit", "nitrito de sodio", "sodium nitrate", "potassium nitrate", "sulfur dioxide", "dioxyde de soufre", "schwefeldioxid", "dióxido de azufre", "sodium metabisulfite", "sodium sulfite", "bha", "bht", "tbhq", "calcium disodium edta", "sodium propionate"],
    category: "preservative",
    explanation: (name) => `${name} is a preservative used to extend shelf life and slow spoilage from mold, yeast, or bacteria.`,
    relevance: "minimal",
    note: () => "Does not directly affect blood sugar.",
  },

  // --- Colors -----------------------------------------------------------------
  {
    terms: ["red 40", "red no. 40", "allura red", "yellow 5", "yellow no. 5", "tartrazine", "yellow 6", "yellow no. 6", "blue 1", "blue no. 1", "blue 2", "blue no. 2", "caramel color", "titanium dioxide", "annatto", "beta-carotene", "paprika extract", "turmeric (color)"],
    category: "color",
    explanation: (name) => `${name} is a coloring agent used to standardize or enhance the product's appearance.`,
    relevance: "minimal",
    note: () => "Used in amounts too small to provide meaningful carbohydrate and does not directly affect blood sugar.",
  },

  // --- Flavor enhancers ---------------------------------------------------------
  {
    terms: ["monosodium glutamate", "glutamate monosodique", "mononatriumglutamat", "glutamato monosódico", "msg", "disodium inosinate", "disodium guanylate", "yeast extract", "extrait de levure", "hefeextrakt", "extracto de levadura", "autolyzed yeast extract"],
    category: "flavor-enhancer",
    explanation: (name) => `${name} is a flavor enhancer that intensifies savory (umami) taste.`,
    relevance: "minimal",
    note: () => "Contributes negligible carbohydrate and does not directly affect blood sugar.",
  },

  // --- Texture agents (emulsifiers, stabilizers, thickeners) -------------------
  {
    terms: ["pectin", "guar gum"],
    category: "texture-agent",
    explanation: (name) => `${name} is a plant-derived thickener that also acts as a soluble fiber.`,
    relevance: "indirect",
    note: () => "Used in small amounts; may modestly slow digestion of other carbohydrates in the product.",
  },
  {
    terms: ["soy lecithin", "lécithine de soja", "lécithines de soja", "sojalecithin", "lecitina de soja", "sunflower lecithin", "sonnenblumenlecithin", "lecithin", "lécithine", "lécithines", "mono- and diglycerides", "monoglycerides", "diglycerides", "xanthan gum", "gomme xanthane", "goma xantana", "carrageenan", "carraghénane", "carrageen", "carragenina", "gellan gum", "locust bean gum", "gum arabic", "agar", "agar-agar", "carboxymethylcellulose", "sodium carboxymethyl cellulose", "emulsifier", "emulsifiers", "stabilizer", "stabilizers", "stabiliser", "stabilisers", "thickener", "thickeners"],
    category: "texture-agent",
    explanation: (name) => `${name} is a texture ingredient (emulsifier, stabilizer, or thickener) used in very small amounts.`,
    relevance: "minimal",
    note: () => "Contributes negligible digestible carbohydrate and does not directly affect blood sugar.",
  },

  // --- Acid regulators ------------------------------------------------------
  {
    terms: ["ascorbic acid"],
    category: "acid-regulator",
    explanation: () => "Ascorbic acid, also known as vitamin C; here it acts as an antioxidant/preservative as well as a nutrient.",
    relevance: "minimal",
    note: () => "Does not directly affect blood sugar.",
  },
  {
    terms: ["citric acid", "acide citrique", "citronensäure", "ácido cítrico", "malic acid", "acide malique", "apfelsäure", "ácido málico", "lactic acid", "acide lactique", "milchsäure", "ácido láctico", "phosphoric acid", "acide phosphorique", "phosphorsäure", "ácido fosfórico", "sodium citrate", "citrate de sodium", "natriumcitrat", "citrato de sodio", "potassium citrate", "tartaric acid", "fumaric acid"],
    category: "acid-regulator",
    explanation: (name) => `${name} is an acid or pH-adjusting ingredient added for tartness, flavor balance, or preservation.`,
    relevance: "minimal",
    note: () => "Does not directly affect blood sugar.",
  },

  // --- Leavening agents -------------------------------------------------------
  {
    terms: ["baking soda", "sodium bicarbonate", "bicarbonate de sodium", "natriumhydrogencarbonat", "bicarbonato de sodio", "baking powder", "cream of tartar", "ammonium bicarbonate", "monocalcium phosphate"],
    category: "leavening-agent",
    explanation: (name) => `${name} is a leavening agent that helps baked goods rise.`,
    relevance: "minimal",
    note: () => "Does not provide meaningful carbohydrate.",
  },

  // --- Vitamins / minerals / fortificants --------------------------------------
  {
    terms: ["niacin", "thiamine mononitrate", "riboflavin", "folic acid", "reduced iron", "ferrous sulfate", "zinc oxide", "vitamin d", "vitamin d3", "vitamin e", "mixed tocopherols", "tocopherols", "calcium carbonate", "potassium chloride", "vitamin b12", "vitamin a palmitate"],
    category: "vitamin-or-mineral",
    explanation: (name) => `${name} is a vitamin, mineral, or fortificant added to the product's nutrient profile.`,
    relevance: "minimal",
    note: () => "Does not directly affect blood sugar.",
  },

  // --- Protein & fat bases (mild, indirect) -----------------------------------
  {
    terms: ["whey protein isolate", "whey protein concentrate", "whey protein", "whey", "soy protein isolate", "soy protein concentrate", "pea protein", "casein", "milk protein concentrate", "collagen", "gelatin", "egg white", "egg", "hydrolyzed protein"],
    category: "protein-or-fat",
    explanation: (name) => `${name} is a protein ingredient.`,
    relevance: "indirect",
    note: () => "Protein has minimal direct effect on blood sugar compared with carbohydrate, though very large amounts can have a modest, indirect effect for some people.",
  },
  {
    terms: ["canola oil", "aceite de canola", "rapeseed oil", "huile de colza", "rapsöl", "sunflower oil", "huile de tournesol", "sonnenblumenöl", "aceite de girasol", "soybean oil", "huile de soja", "sojaöl", "aceite de soja", "vegetable oil", "pflanzenöl", "palm oil", "huile de palme", "palmöl", "aceite de palma", "coconut oil", "huile de coco", "kokosöl", "aceite de coco", "olive oil", "huile d'olive", "olivenöl", "aceite de oliva", "cocoa butter", "beurre de cacao", "kakaobutter", "manteca de cacao", "butter", "safflower oil"],
    category: "protein-or-fat",
    explanation: (name) => `${name} is a fat or oil ingredient.`,
    relevance: "indirect",
    note: () => "Fat has no carbohydrate and does not directly raise blood sugar, though it can slow how quickly other carbohydrates in the product are absorbed.",
  },
  {
    terms: ["milk", "lait", "milch", "leche", "whole milk", "skim milk", "lait écrémé", "magermilch", "leche descremada", "nonfat milk", "cream", "crème", "sahne", "crema", "buttermilk"],
    category: "protein-or-fat",
    explanation: (name) => `${name} naturally contains lactose, a milk sugar.`,
    relevance: "indirect",
    note: () => "Lactose provides a moderate, gradual contribution to carbohydrate and blood sugar — generally slower than added sugar.",
  },
  {
    terms: ["hazelnut", "hazelnuts", "noisette", "noisettes", "haselnuss", "haselnüsse", "avellana", "avellanas", "almond", "almonds", "amande", "amandes", "mandel", "mandeln", "almendra", "almendras", "peanut", "peanuts", "cacahuète", "cacahuètes", "erdnuss", "erdnüsse", "cacahuete", "cacahuetes", "walnut", "walnuts", "cashew", "cashews", "pistachio", "pistachios", "pecan", "pecans", "macadamia", "sunflower seed", "sunflower seeds", "chia seed", "chia seeds", "flax seed", "flaxseed", "sesame seed", "sesame seeds", "nut", "nuts", "tree nut", "tree nuts"],
    category: "protein-or-fat",
    explanation: (name) => `${name} is a whole nut or seed, providing mostly fat and protein.`,
    relevance: "minimal",
    note: () => "Naturally low in digestible carbohydrate and does not directly raise blood sugar.",
  },

  // --- Flavoring / base ingredients --------------------------------------------
  {
    terms: ["natural flavor", "arôme naturel", "arômes naturels", "natürliches aroma", "aroma natural", "artificial flavor", "natural and artificial flavors", "flavor", "flavour", "flavoring", "flavouring", "flavorings", "flavourings", "vanilla extract", "vanillin", "vanilline", "vainillina", "cocoa", "cocoa powder", "spices", "épices", "gewürze", "especias"],
    category: "flavoring-or-base",
    explanation: (name) => `${name} is used to give the product its characteristic taste or aroma.`,
    relevance: "minimal",
    note: () => "Used in amounts too small to provide meaningful carbohydrate.",
  },
  {
    terms: ["salt", "sel", "salz", "sal", "sea salt", "kosher salt"],
    category: "flavoring-or-base",
    explanation: () => "Table salt (sodium chloride).",
    relevance: "minimal",
    note: () => "Contains no carbohydrate and does not directly affect blood sugar, though it is relevant to blood pressure.",
  },
  {
    terms: ["water", "eau", "wasser", "agua", "filtered water", "carbonated water"],
    category: "flavoring-or-base",
    explanation: (name) => `${name} contains no carbohydrate, calories, or nutrients.`,
    relevance: "minimal",
  },
  {
    terms: ["yeast", "levure", "hefe", "levadura"],
    category: "flavoring-or-base",
    explanation: () => "A leavening organism used in baking or fermentation.",
    relevance: "minimal",
  },
];

// ---------------------------------------------------------------------------
// E-number lookups (map a bare code like "E330" onto the same dictionary)
// ---------------------------------------------------------------------------

const E_CODE_TO_TERM: Record<string, string> = {
  e100: "turmeric (color)",
  e102: "yellow 5",
  e110: "yellow 6",
  e120: "carmine",
  e129: "red 40",
  e133: "blue 1",
  e150: "caramel color",
  e150a: "caramel color",
  e150d: "caramel color",
  e160a: "beta-carotene",
  e171: "titanium dioxide",
  e200: "sorbic acid",
  e202: "potassium sorbate",
  e211: "sodium benzoate",
  e220: "sulfur dioxide",
  e223: "sodium metabisulfite",
  e250: "sodium nitrite",
  e251: "sodium nitrate",
  e296: "malic acid",
  e300: "ascorbic acid",
  e306: "mixed tocopherols",
  e322: "lecithin",
  e330: "citric acid",
  e331: "sodium citrate",
  e333: "calcium carbonate",
  e401: "sodium alginate",
  e407: "carrageenan",
  e410: "locust bean gum",
  e412: "guar gum",
  e414: "gum arabic",
  e415: "xanthan gum",
  e440: "pectin",
  e466: "carboxymethylcellulose",
  e471: "monoglycerides",
  e500: "sodium bicarbonate",
  e501: "potassium carbonate",
  e621: "monosodium glutamate",
  e627: "disodium guanylate",
  e631: "disodium inosinate",
  e950: "acesulfame potassium",
  e951: "aspartame",
  e954: "saccharin",
  e955: "sucralose",
  e967: "xylitol",
  e968: "erythritol",
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

function splitTopLevel(text: string): string[] {
  const segments: string[] = [];
  let depth = 0;
  let current = "";
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === "(" || char === "[") depth += 1;
    else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
    const isDecimalComma =
      char === "," &&
      /\d/u.test(text[index - 1] ?? "") &&
      /\d/u.test(text[index + 1] ?? "");
    if ((char === "," || char === ";") && depth === 0 && !isDecimalComma) {
      segments.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) segments.push(current);
  return segments;
}

function cleanSegment(raw: string): { main: string; inner: string | null } {
  const trimmedSeg = raw.trim();
  let depth = 0;
  let parenStart = -1;
  let parenEnd = -1;
  for (let i = 0; i < trimmedSeg.length; i += 1) {
    const char = trimmedSeg[i];
    if (char === "(") {
      if (depth === 0 && parenStart === -1) parenStart = i;
      depth += 1;
    } else if (char === ")") {
      depth -= 1;
      if (depth === 0 && parenStart !== -1) parenEnd = i;
    }
  }
  let main = trimmedSeg;
  let inner: string | null = null;
  if (parenStart !== -1 && parenEnd > parenStart) {
    main = trimmedSeg.slice(0, parenStart).trim();
    inner = trimmedSeg.slice(parenStart + 1, parenEnd).trim();
    // If nothing precedes the parenthesis (e.g. "(vitamin C)"), treat the
    // inner text itself as the main ingredient.
    if (!main) {
      main = inner;
      inner = null;
    }
  }
  main = main
    .replace(/^(?:ingredients?|ingrédients?|zutaten|ingredientes)\s*:/iu, "")
    .replace(/^and\s+/i, "")
    .replace(/^contains\s*(less than\s*)?\d+(\.\d+)?%?\s*(or less\s*)?(of)?:?/i, "")
    .replace(/\d+(?:[.,]\d+)?%/g, "")
    .replace(/[.*]+$/g, "")
    .trim();
  return { main, inner };
}

/**
 * Parses raw ingredient text into a flat, ordered, de-duplicated list of
 * ingredient names — flattening parenthetical sub-ingredient lists (e.g.
 * "Enriched flour (wheat flour, niacin, iron)") alongside top-level ones.
 */
export function parseIngredientList(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  const visit = (segment: string) => {
    const { main, inner } = cleanSegment(segment);
    if (main && main.length <= 140) {
      const key = main.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        names.push(main);
      }
    }
    if (inner) {
      for (const sub of splitTopLevel(inner)) visit(sub);
    }
  };

  for (const segment of splitTopLevel(text)) visit(segment);
  return names.slice(0, 120);
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

/**
 * If `term` is a bare E-number (e.g. "E330" or "E-330"), resolves it to the
 * named additive it stands for so bare codes get the same explanation as
 * their spelled-out name.
 */
function resolveECode(term: string): string | null {
  const match = term.trim().toLowerCase().replace(/[\s-]+/g, "").match(/^e(\d{3,4}[a-z]?)$/i);
  if (!match) return null;
  return E_CODE_TO_TERM[`e${match[1]}`] ?? null;
}

/**
 * Classifies one ingredient against the reference dictionary.
 *
 * `displayName` is what the user sees (the exact text from the ingredient
 * list or provider label). `matchTerm` is what is actually matched against
 * the dictionary — usually the same as `displayName`, but for a
 * taxonomy-backed ingredient it is the language-agnostic canonical English
 * term instead, so a localized label (e.g. "Sucre") is still recognized.
 */
function classifyByMatchTerm(displayName: string, matchTerm: string): IngredientExplanation {
  const resolved = resolveECode(matchTerm);
  const finalName = resolved && resolved.toLowerCase() !== displayName.toLowerCase() ? `${displayName} (${resolved})` : displayName;
  const target = (resolved ?? matchTerm).toLowerCase();

  for (const entry of DICTIONARY) {
    for (const term of entry.terms) {
      const pattern = new RegExp(`\\b${escapeRegExp(term)}\\b`, "iu");
      if (pattern.test(target)) {
        return {
          name: finalName,
          category: entry.category,
          explanation: entry.explanation(finalName),
          bloodSugarRelevance: entry.relevance,
          bloodSugarNote: entry.note ? entry.note(finalName) : null,
        };
      }
    }
  }

  return {
    name: finalName,
    category: "unclassified",
    explanation: `BioTrace doesn't yet have a plain-language reference for "${finalName}." This isn't invented or estimated — check the package or ask the Assistant for general information about it.`,
    bloodSugarRelevance: "unknown",
    bloodSugarNote: null,
  };
}

/** Classifies one ingredient name (as it appears in raw ingredient text) against the reference dictionary. */
export function classifyIngredient(rawName: string): IngredientExplanation {
  const original = rawName.trim();
  return classifyByMatchTerm(original, original);
}

/**
 * One entry from a provider's language-agnostic ingredient taxonomy, e.g.
 * Open Food Facts' `ingredients` array: `id` is a canonical English id such
 * as "en:sugar" or "en:e322", `text` is the original (possibly non-English)
 * label text such as "Sucre".
 */
export type IngredientSourceItem = { id: string; text: string | null };

function canonicalTermFromId(id: string): string {
  return id.replace(/^[a-z]{2,3}:/i, "").replace(/-/g, " ").trim();
}

export type UnclassifiedIngredientTelemetry = {
  /** A provider taxonomy ID when available; null for OCR-only ingredients. */
  canonicalId: string | null;
  /** Normalized ingredient text, retained only as an aggregate dimension. */
  ingredientName: string;
  /** Stable key used to combine this ingredient's counts. */
  ingredientKey: string;
};

function normalizeTelemetryName(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase().slice(0, 140);
}

function normalizeTelemetryCanonicalId(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  // Keep only the short, namespaced IDs emitted by the provider taxonomy.
  if (!/^[a-z]{2,3}:[a-z0-9][a-z0-9._:-]{0,139}$/u.test(normalized)) return null;
  return normalized;
}

/**
 * Classifies one taxonomy-backed ingredient. Matches against the reference
 * dictionary using the provider's canonical English id (so a French, German,
 * or Spanish label is still recognized) while displaying the ingredient's
 * original on-label text to the user.
 */
export function classifyStructuredIngredient(item: IngredientSourceItem): IngredientExplanation {
  const canonicalTerm = canonicalTermFromId(item.id);
  const displayName = (item.text && item.text.trim()) || canonicalTerm;
  return classifyByMatchTerm(displayName, canonicalTerm);
}

/**
 * Returns only the unclassified dimensions needed for aggregate telemetry.
 * The result is de-duplicated exactly like analyzeIngredients, and contains no
 * product, session, barcode, label-photo, or raw-list data.
 */
export function collectUnclassifiedIngredientTelemetry(
  ingredientsText: string | null | undefined,
  structuredIngredients?: readonly IngredientSourceItem[] | null,
): UnclassifiedIngredientTelemetry[] {
  const entries: UnclassifiedIngredientTelemetry[] = [];
  const seen = new Set<string>();

  const add = (name: string, canonicalId: string | null) => {
    const ingredientName = normalizeTelemetryName(name);
    if (!ingredientName) return;
    const ingredientKey = canonicalId ? `id:${canonicalId}` : `name:${ingredientName}`;
    if (seen.has(ingredientKey)) return;
    seen.add(ingredientKey);
    entries.push({ canonicalId, ingredientName, ingredientKey });
  };

  if (structuredIngredients && structuredIngredients.length) {
    for (const item of structuredIngredients) {
      if (seen.size >= 120) break;
      const canonicalId = normalizeTelemetryCanonicalId(item.id);
      const explanation = classifyStructuredIngredient(item);
      if (explanation.category === "unclassified") {
        add(explanation.name, canonicalId);
      }
    }
    return entries;
  }

  const text = ingredientsText?.trim() || "";
  if (!text) return entries;
  for (const name of parseIngredientList(text)) {
    if (entries.length >= 120) break;
    const explanation = classifyIngredient(name);
    if (explanation.category === "unclassified") {
      add(explanation.name, null);
    }
  }
  return entries;
}

// ---------------------------------------------------------------------------
// Full analysis
// ---------------------------------------------------------------------------

function buildSummary(ingredients: IngredientExplanation[], sweeteners: IngredientExplanation[], additives: IngredientExplanation[], unclassifiedCount: number): string {
  if (ingredients.length === 0) {
    return "No ingredient list was available to analyze.";
  }
  const parts: string[] = [`This product lists ${ingredients.length} recognized ingredient${ingredients.length === 1 ? "" : "s"}.`];
  if (sweeteners.length > 0) {
    const names = sweeteners.slice(0, 3).map((s) => s.name).join(", ");
    parts.push(`${sweeteners.length} sweetener${sweeteners.length === 1 ? "" : "s"} (${names}${sweeteners.length > 3 ? ", and others" : ""}) can directly or indirectly affect blood sugar.`);
  }
  if (additives.length > 0) {
    const names = additives.slice(0, 3).map((a) => a.name).join(", ");
    parts.push(`${additives.length} other additive${additives.length === 1 ? "" : "s"} (${names}${additives.length > 3 ? ", and others" : ""}) were identified; most do not meaningfully affect blood sugar.`);
  }
  if (unclassifiedCount > 0) {
    parts.push(`${unclassifiedCount} ingredient${unclassifiedCount === 1 ? " wasn't" : "s weren't"} in BioTrace's reference yet.`);
  }
  return parts.join(" ");
}

/**
 * The single ingredient-analysis engine shared by every BioTrace entry point:
 * barcode scan, QR scan, name search (which resolves to a barcode lookup),
 * and label photo scan. It never invents an ingredient that isn't present in
 * `ingredientsText` (or `structuredIngredients`), and it never touches the
 * deterministic BioTrace score.
 *
 * When `structuredIngredients` is provided (Open Food Facts' language-agnostic
 * ingredient taxonomy), it is used as the authoritative ingredient list so
 * non-English labels are still recognized and explained correctly — falling
 * back to parsing `ingredientsText` only when no structured data is available
 * (e.g. OCR'd label photos, which have no taxonomy).
 */
export function analyzeIngredients(
  ingredientsText: string | null | undefined,
  structuredIngredients?: readonly IngredientSourceItem[] | null,
): IngredientAnalysis {
  const text = ingredientsText?.trim() || "";
  let ingredients: IngredientExplanation[];
  if (structuredIngredients && structuredIngredients.length) {
    const seen = new Set<string>();
    ingredients = [];
    for (const item of structuredIngredients) {
      const key = item.id.toLowerCase();
      if (seen.has(key) || ingredients.length >= 120) continue;
      seen.add(key);
      ingredients.push(classifyStructuredIngredient(item));
    }
  } else {
    const names = text ? parseIngredientList(text) : [];
    ingredients = names.map(classifyIngredient);
  }
  const sweeteners = ingredients.filter((i) => SWEETENER_CATEGORIES.has(i.category));
  const additives = ingredients.filter((i) => ADDITIVE_CATEGORIES.has(i.category));
  const unclassifiedCount = ingredients.filter((i) => i.category === "unclassified").length;

  return ingredientAnalysisSchema.parse({
    ingredients,
    sweeteners,
    additives,
    unclassifiedCount,
    summary: buildSummary(ingredients, sweeteners, additives, unclassifiedCount),
    sourceText: text || null,
  });
}
