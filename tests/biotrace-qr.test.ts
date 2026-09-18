import assert from "node:assert/strict";
import test from "node:test";
import { getBloodSugarImpact, getWhyText } from "../lib/mealInsights";
import {
  calculateNetCarbohydrates,
  parseStructuredQrMenu,
  scoreStructuredQrMenuItem,
} from "../shared/structured-qr-menu";

const recognizedMenu = {
  schema: "diabeats.test.menu.v1" as const,
  restaurant: "Blue Nile Test Kitchen",
  menu_id: "DBT-MENU-2026-001",
  test_only: true as const,
  items: [
    {
      id: "BN101",
      name: "Grilled Chicken Teff Bowl",
      calories: 480,
      carbs_g: 44,
      fiber_g: 9,
      sugar_g: 6,
      protein_g: 38,
    },
  ],
};

test("parses the recognized DiabEats test menu schema", () => {
  const parsed = parseStructuredQrMenu(JSON.stringify(recognizedMenu));
  assert.ok(parsed);
  assert.equal(parsed.restaurant, "Blue Nile Test Kitchen");
  assert.equal(parsed.items[0].name, "Grilled Chicken Teff Bowl");
});

test("unknown or malformed structured QR formats keep the safe fallback", () => {
  assert.equal(
    parseStructuredQrMenu(JSON.stringify({ ...recognizedMenu, schema: "unknown.menu.v1" })),
    null,
  );
  assert.equal(
    parseStructuredQrMenu(JSON.stringify({ ...recognizedMenu, test_only: false })),
    null,
  );
  assert.equal(
    parseStructuredQrMenu(JSON.stringify({ ...recognizedMenu, items: [{ name: "Missing fields" }] })),
    null,
  );
});

test("calculates net carbohydrates without allowing a negative result", () => {
  const item = recognizedMenu.items[0];
  assert.equal(calculateNetCarbohydrates(item), 35);
  assert.equal(calculateNetCarbohydrates({ ...item, carbs_g: 3, fiber_g: 5 }), 0);
});

test("reuses deterministic scoring and diet-goal guidance", () => {
  const item = recognizedMenu.items[0];
  const first = scoreStructuredQrMenuItem(item);
  const second = scoreStructuredQrMenuItem({ ...item });
  assert.deepEqual(first, second);

  const nutrients = [
    { label: "Carbs", value: `${item.carbs_g}g` },
    { label: "Fiber", value: `${item.fiber_g}g` },
    { label: "Sugar", value: `${item.sugar_g}g` },
    { label: "Protein", value: `${item.protein_g}g` },
  ];
  assert.equal(getBloodSugarImpact(nutrients, "strict").label, "HIGH");
  assert.equal(getBloodSugarImpact(nutrients, "balanced").label, "HIGH");
  assert.match(getWhyText(nutrients), /high carbohydrates/i);
});