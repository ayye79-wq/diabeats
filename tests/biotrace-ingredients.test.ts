import assert from "node:assert/strict";
import test from "node:test";
import {
  analyzeIngredients,
  classifyIngredient,
  classifyStructuredIngredient,
  collectUnclassifiedIngredientTelemetry,
  parseIngredientList,
  SWEETENER_CATEGORIES,
  ADDITIVE_CATEGORIES,
} from "../shared/biotrace-ingredients";
import { containsUnsafeMedicalAdvice } from "../shared/ai-safety";

test("parses a flat comma-separated ingredient list", () => {
  const names = parseIngredientList("Water, Cane Sugar, Salt, Citric Acid");
  assert.deepEqual(names, ["Water", "Cane Sugar", "Salt", "Citric Acid"]);
});

test("flattens parenthetical sub-ingredients alongside top-level ones", () => {
  const names = parseIngredientList("Enriched flour (wheat flour, niacin, iron), water, salt");
  assert.ok(names.includes("Enriched flour"));
  assert.ok(names.includes("wheat flour"));
  assert.ok(names.includes("niacin"));
  assert.ok(names.includes("iron"));
  assert.ok(names.includes("water"));
  assert.ok(names.includes("salt"));
});

test("strips a leading Ingredients: label and percentage annotations", () => {
  const names = parseIngredientList("Ingredients: Corn (2%), Sugar, Salt");
  assert.deepEqual(names, ["Corn", "Sugar", "Salt"]);
});

test("preserves decimal commas while parsing localized percentage annotations", () => {
  const names = parseIngredientList("Ingrédients: sucre, cacao 7,4%, lait");
  assert.deepEqual(names, ["sucre", "cacao", "lait"]);
});

test("de-duplicates repeated ingredient names while preserving order", () => {
  const names = parseIngredientList("water, sugar, water, salt");
  assert.deepEqual(names, ["water", "sugar", "salt"]);
});

test("classifies a recognized added sugar with a direct blood-sugar note", () => {
  const explanation = classifyIngredient("Cane Sugar");
  assert.equal(explanation.category, "recognized-sugar");
  assert.equal(explanation.bloodSugarRelevance, "direct");
  assert.ok(explanation.bloodSugarNote);
});

test("classifies maltodextrin distinctly from other starches", () => {
  const explanation = classifyIngredient("Maltodextrin");
  assert.equal(explanation.category, "maltodextrin");
  assert.equal(explanation.bloodSugarRelevance, "direct");
});

test("classifies a named artificial sweetener and a named novel sweetener differently", () => {
  const aspartame = classifyIngredient("Aspartame");
  const stevia = classifyIngredient("Stevia Leaf Extract");
  assert.equal(aspartame.category, "artificial-sweetener");
  assert.equal(stevia.category, "novel-sweetener");
  assert.notEqual(aspartame.explanation, stevia.explanation);
});

test("classifies non-sweetener additives (preservatives, colors, texture agents) as low blood-sugar relevance", () => {
  for (const name of ["Sodium Benzoate", "Red 40", "Xanthan Gum", "Citric Acid"]) {
    const explanation = classifyIngredient(name);
    assert.ok(ADDITIVE_CATEGORIES.has(explanation.category) || explanation.category === "acid-regulator");
    assert.notEqual(explanation.bloodSugarRelevance, "direct");
  }
});

test("resolves a bare E-number to its named additive", () => {
  const explanation = classifyIngredient("E330");
  assert.equal(explanation.category, "acid-regulator");
  assert.match(explanation.explanation.toLowerCase(), /citric acid|vitamin c/);
});

test("never invents an explanation for an unrecognized ingredient", () => {
  const explanation = classifyIngredient("Zyzzyxanthin-9000");
  assert.equal(explanation.category, "unclassified");
  assert.equal(explanation.bloodSugarRelevance, "unknown");
  assert.match(explanation.explanation, /doesn't yet have a plain-language reference/i);
  assert.match(explanation.explanation, /isn't invented or estimated/i);
});

test("collects only normalized unclassified names for OCR aggregate telemetry", () => {
  const gaps = collectUnclassifiedIngredientTelemetry(
    "Water, Mystery Crisp, MYSTERY   CRISP, Another Unknown",
  );
  assert.deepEqual(gaps, [
    {
      canonicalId: null,
      ingredientName: "mystery crisp",
      ingredientKey: "name:mystery crisp",
    },
    {
      canonicalId: null,
      ingredientName: "another unknown",
      ingredientKey: "name:another unknown",
    },
  ]);
  assert.equal(JSON.stringify(gaps).includes("Water"), false);
});

test("groups structured reference gaps by canonical provider id", () => {
  const gaps = collectUnclassifiedIngredientTelemetry(null, [
    { id: "en:unmapped-crisp", text: "Mystery Crisp" },
    { id: "EN:UNMAPPED-CRISP", text: "Croustillant mystère" },
    { id: "en:sugar", text: "Sucre" },
  ]);
  assert.deepEqual(gaps, [
    {
      canonicalId: "en:unmapped-crisp",
      ingredientName: "mystery crisp",
      ingredientKey: "id:en:unmapped-crisp",
    },
  ]);
});

test("does not retain raw ingredient lists or scan context in telemetry dimensions", () => {
  const sourceText = "Ingredients: Unmapped Blend, Salt";
  const [gap] = collectUnclassifiedIngredientTelemetry(sourceText);
  assert.deepEqual(Object.keys(gap).sort(), ["canonicalId", "ingredientKey", "ingredientName"]);
  assert.equal(JSON.stringify(gap).includes(sourceText), false);
});

test("full analysis groups sweeteners and additives separately and counts unclassified ingredients", () => {
  const analysis = analyzeIngredients(
    "Water, Cane Sugar, Maltodextrin, Aspartame, Citric Acid, Soy Lecithin, Zyzzyxanthin-9000",
  );
  assert.ok(analysis.sweeteners.length >= 3);
  assert.ok(analysis.additives.length >= 1);
  assert.equal(analysis.unclassifiedCount, 1);
  for (const s of analysis.sweeteners) assert.ok(SWEETENER_CATEGORIES.has(s.category));
  assert.match(analysis.summary, /sweetener/i);
});

test("classifies a taxonomy-backed ingredient by its canonical English id, not the localized label text", () => {
  const explanation = classifyStructuredIngredient({ id: "en:sugar", text: "Sucre" });
  assert.equal(explanation.category, "recognized-sugar");
  assert.equal(explanation.bloodSugarRelevance, "direct");
  // The user-facing name stays the localized on-label text even though
  // classification matched on the canonical English id ("sugar").
  assert.equal(explanation.name, "Sucre");
  assert.match(explanation.explanation, /table sugar/i);
});

test("resolves a bare E-number id from a taxonomy entry to its named additive", () => {
  const explanation = classifyStructuredIngredient({ id: "en:e322", text: "lécithines" });
  assert.equal(explanation.category, "texture-agent");
  assert.match(explanation.name, /lécithines/);
  assert.match(explanation.name.toLowerCase(), /lecithin/);
});

test("falls back to the canonical term as the display name when no localized text is available", () => {
  const explanation = classifyStructuredIngredient({ id: "en:palm-oil", text: null });
  assert.equal(explanation.name, "palm oil");
  assert.equal(explanation.category, "protein-or-fat");
});

test("never invents an explanation for an unrecognized taxonomy id", () => {
  const explanation = classifyStructuredIngredient({ id: "en:some-unmapped-ingredient", text: "Some Unmapped Ingredient" });
  assert.equal(explanation.category, "unclassified");
  assert.match(explanation.explanation, /doesn't yet have a plain-language reference/i);
});

test("explains OCR-only ingredient lists in common non-English languages", () => {
  for (const example of [
    "Zutaten: Zucker, Palmöl, Haselnüsse, Vanillin",
    "Ingrédients: sucre, huile de palme, noisettes, vanilline",
    "Ingredientes: azúcar, aceite de palma, avellanas, vainillina",
  ]) {
    const analysis = analyzeIngredients(example);
    assert.equal(analysis.ingredients.length, 4);
    assert.equal(analysis.unclassifiedCount, 0);
    assert.equal(analysis.sweeteners.length, 1);
    assert.equal(analysis.sourceText, example);
    for (const ingredient of analysis.ingredients) {
      assert.doesNotMatch(ingredient.explanation, /doesn't yet have a plain-language reference/i);
    }
  }
});

test("never invents ingredients while explaining a localized OCR list", () => {
  const analysis = analyzeIngredients("Zutaten: Wasser, Zucker, Fremdzutat");
  assert.deepEqual(analysis.ingredients.map((ingredient) => ingredient.name), [
    "Wasser",
    "Zucker",
    "Fremdzutat",
  ]);
  assert.equal(analysis.unclassifiedCount, 1);
  assert.equal(analysis.ingredients.some((ingredient) => ingredient.name === "Palmöl"), false);
});

test("prefers structured (taxonomy-backed) ingredients over raw text when both are supplied, correctly explaining a non-English label", () => {
  const analysis = analyzeIngredients(
    "Sucre, huile de palme, NOISETTES 13%, cacao maigre 7,4%, LAIT écrémé en poudre 6,6%, LACTOSERUM en poudre, émulsifiants: lécithines [SOJA), vanilline. Sans gluten.",
    [
      { id: "en:sugar", text: "Sucre" },
      { id: "en:palm-oil", text: "huile de palme" },
      { id: "en:hazelnut", text: "NOISETTES" },
      { id: "en:fat-reduced-cocoa", text: "cacao maigre" },
      { id: "en:skimmed-milk-powder", text: "LAIT écrémé en poudre" },
      { id: "en:whey-powder", text: "LACTOSERUM en poudre" },
      { id: "en:e322", text: "lécithines" },
      { id: "en:soya-lecithin", text: null },
      { id: "en:vanillin", text: "vanilline" },
    ],
  );
  assert.equal(analysis.unclassifiedCount, 0);
  assert.ok(analysis.sweeteners.some((s) => s.name === "Sucre"));
  const lecithinEntries = analysis.ingredients.filter((i) => i.name.toLowerCase().includes("lecithin") || i.name.toLowerCase().includes("lécithines"));
  assert.ok(lecithinEntries.length >= 1);
  for (const ingredient of analysis.ingredients) {
    assert.doesNotMatch(ingredient.explanation, /doesn't yet have a plain-language reference/i);
  }
  // The raw ingredientsText is still preserved as evidence even when structured data drives classification.
  assert.match(analysis.sourceText ?? "", /Sucre, huile de palme/);
});

test("returns an empty, honest analysis when there is no ingredient text", () => {
  const analysis = analyzeIngredients(null);
  assert.deepEqual(analysis.ingredients, []);
  assert.equal(analysis.unclassifiedCount, 0);
  assert.equal(analysis.sourceText, null);
  assert.match(analysis.summary, /no ingredient list/i);
});

test("produces the exact same analysis for the same ingredient text every time (deterministic)", () => {
  const text = "Enriched flour (wheat flour, niacin), high fructose corn syrup, salt, natural flavor";
  assert.deepEqual(analyzeIngredients(text), analyzeIngredients(text));
});

test("keeps all ingredient explanations free of alarming or medical-advice language", () => {
  const analysis = analyzeIngredients(
    "Water, cane sugar, high fructose corn syrup, aspartame, sucralose, stevia, sodium benzoate, red 40, maltodextrin, xanthan gum, citric acid, whey protein, canola oil, ascorbic acid",
  );
  for (const ingredient of analysis.ingredients) {
    assert.equal(containsUnsafeMedicalAdvice(ingredient.explanation), false);
    if (ingredient.bloodSugarNote) assert.equal(containsUnsafeMedicalAdvice(ingredient.bloodSugarNote), false);
  }
});
