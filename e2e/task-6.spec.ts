import { expect, Page, test } from "playwright/test";

const APP_PATH = "/app";
const BIO_TRACE_BARCODE = "3017620422003";
const BIO_TRACE_PRODUCT = {
  product: {
    barcode: BIO_TRACE_BARCODE,
    name: "Shared Test Product",
    brand: "DiabEats Pantry",
    quantity: "40g",
    categories: ["snacks"],
    imageAvailable: false,
    ingredientsText: "Oats, almonds, and cinnamon.",
    nutrition: {
      servingSize: "40g",
      servingQuantityGrams: 40,
      energyKcal: 160,
      carbohydratesGrams: 16,
      sugarsGrams: 4,
      addedSugarsGrams: 0,
      fiberGrams: 4,
      proteinGrams: 5,
      fatGrams: 7,
      saturatedFatGrams: 1,
      sodiumMilligrams: 95,
      basis: "serving",
    },
    ingredients: {
      sweeteners: [],
      additives: [],
      hasSweeteners: false,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    },
    gmo: {
      status: "unknown",
      reason: "No verified GMO statement was supplied.",
      signals: [],
    },
    labels: [],
    novaGroup: 2,
    nutriScore: "b",
    source: {
      provider: "open-food-facts",
      url: null,
      retrievedAt: "2026-08-23T00:00:00.000Z",
      completeness: 1,
    },
  },
  rating: {
    label: "better-fit",
    display: "Better choice",
    score: 72,
    factors: [
      {
        key: "fiber",
        label: "Good fiber content",
        impact: "positive",
        value: 4,
        basis: "serving",
      },
    ],
    perServing: true,
    summary: "A fiber-rich snack with no added sugar.",
    disclaimer: "BioTrace provides educational label summaries, not medical advice.",
  },
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/session", async (route) => {
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({
        token: "e2e-session-token",
        revenueCatUserId: "e2e-user",
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    });
  });
});

async function completeOnboarding(page: Page) {
  await page.goto(APP_PATH);
  await page.evaluate(() => localStorage.clear());
  await page.reload();

  await expect(page.getByText("Welcome to DiabEats")).toBeVisible();

  for (let step = 0; step < 3; step += 1) {
    await page.getByRole("button", { name: "Continue", exact: true }).click();
  }

  await expect(page.getByText("You’re all set!")).toBeVisible();
  await page.getByRole("button", { name: "Start Exploring", exact: true }).click();
  await expect(page.getByTestId("tab-discover")).toBeVisible();
}

async function clickTab(page: Page, name: string) {
  const tabIds: Record<string, string> = {
    Discover: "tab-discover",
    Scan: "tab-scan",
    Saved: "tab-saved",
    Assistant: "tab-assistant",
    Profile: "tab-profile",
  };
  await page.getByTestId(tabIds[name] ?? `tab-${name.toLowerCase()}`).click();
}

async function mockBioTraceProduct(page: Page) {
  await page.route(`**/api/biotrace/product/${BIO_TRACE_BARCODE}`, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(BIO_TRACE_PRODUCT),
    });
  });
}

test("completes onboarding and shows Discover search progress and results", async ({ page }) => {
  await completeOnboarding(page);

  const searchInput = page.getByRole("textbox", {
    name: "Search restaurants and meals",
    exact: true,
  });
  await expect(searchInput).toHaveAttribute("aria-label", "Search restaurants and meals");

  await page.route("**/api/search", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        intent: {
          summary: "Low-carb dinner options",
          criteria: ["good"],
          isHealthIntent: true,
          mentionedRestaurant: null,
          restaurantNotFound: false,
        },
        results: [
          {
            item: {
              id: "e2e-grilled-salmon",
              name: "Grilled Salmon",
              description: "Herb grilled salmon with greens",
              category: "Dinner",
              price: "$18",
              diabeticScore: "good",
              carbRange: "8g carbs",
              quickTip: "Ask for dressing on the side.",
              nutrients: [{ label: "Calories", value: "420" }],
            },
            restaurant: {
              id: "e2e-restaurant",
              name: "Test Kitchen",
              cuisine: "American",
              distance: "0.5 mi",
              rating: 4.8,
            },
          },
        ],
      }),
    });
  });

  await searchInput.fill("low carb dinner");
  await searchInput.press("Enter");

  await expect(page.getByText("Understanding your search...", { exact: true })).toBeVisible();
  await expect(page.getByText("Low-carb dinner options", { exact: true })).toBeVisible();
  await expect(
    page.getByText("1 matching item across all restaurants", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Grilled Salmon", { exact: true })).toBeVisible();
});

test("exposes Discover shortcuts as named keyboard buttons", async ({ page }) => {
  await completeOnboarding(page);

  const shortcuts = [
    {
      name: "Find blood-sugar-friendly meals",
      testId: "find-safe-meal-btn",
    },
    {
      name: "Open BioTrace to scan a packaged food product",
      testId: "open-biotrace-btn",
    },
  ];

  for (const shortcutInfo of shortcuts) {
    const shortcut = page.getByRole("button", { name: shortcutInfo.name, exact: true });
    await expect(shortcut).toHaveAttribute("data-testid", shortcutInfo.testId);
    await expect(shortcut).toHaveAttribute("role", "button");
    await expect(shortcut).toHaveAttribute("aria-label", shortcutInfo.name);
    await expect(shortcut).toHaveAttribute("tabindex", "0");

    await shortcut.focus();
    await expect(shortcut).toBeFocused();
  }

  await page.getByRole("button", { name: "Find blood-sugar-friendly meals", exact: true }).press("Enter");
  await expect(page).toHaveURL(/\/safe-nearby$/);
  await expect(page.getByText("Safe Meals Near You", { exact: true })).toBeVisible();
});

test("opens a hard-loaded BioTrace product link after onboarding", async ({ page }) => {
  await mockBioTraceProduct(page);

  const productPath = `${APP_PATH}/biotrace-product/${BIO_TRACE_BARCODE}`;
  await page.goto(productPath);

  await expect(page).toHaveURL(productPath);
  await expect(page.getByText("Shared Test Product", { exact: true })).toBeVisible();
  await expect(page.getByText("BioTrace product result", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(productPath);
  await expect(page.getByText("Shared Test Product", { exact: true })).toBeVisible();
  await expect(page.getByText("Unmatched Route", { exact: true })).not.toBeVisible();
});

test("opens a shared restaurant link in a fresh browser and after refresh", async ({ page }) => {
  const restaurantPath = `${APP_PATH}/restaurant/r1`;

  await page.goto(restaurantPath);

  await expect(page).toHaveURL(restaurantPath);
  await expect(page.getByText("The Green Fork", { exact: true })).toBeVisible();
  await expect(page.getByText("Welcome to DiabEats", { exact: true })).not.toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(restaurantPath);
  await expect(page.getByText("The Green Fork", { exact: true })).toBeVisible();
  await expect(page.getByText("Welcome to DiabEats", { exact: true })).not.toBeVisible();
});

test("opens a shared meal link in a fresh browser and after refresh", async ({ page }) => {
  const mealPath = `${APP_PATH}/meal/r1/m1-1`;

  await page.goto(mealPath);

  await expect(page).toHaveURL(mealPath);
  await expect(page.getByText("Grilled Salmon Salad", { exact: true })).toBeVisible();
  await expect(page.getByText("Welcome to DiabEats", { exact: true })).not.toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(mealPath);
  await expect(page.getByText("Grilled Salmon Salad", { exact: true })).toBeVisible();
  await expect(page.getByText("Welcome to DiabEats", { exact: true })).not.toBeVisible();
});

test("opens a saved BioTrace product and carries it to Assistant", async ({ page }) => {
  await mockBioTraceProduct(page);
  await page.route("**/api/biotrace/saved", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([
        {
          id: 1,
          barcode: BIO_TRACE_BARCODE,
          productName: BIO_TRACE_PRODUCT.product.name,
          brand: BIO_TRACE_PRODUCT.product.brand,
          ratingLabel: BIO_TRACE_PRODUCT.rating.label,
          note: null,
          createdAt: "2026-08-23T00:00:00.000Z",
        },
      ]),
    });
  });
  await page.route("**/api/biotrace/scans", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify([]),
    });
  });

  await completeOnboarding(page);
  await clickTab(page, "Saved");
  await page.getByRole("tab", { name: /BioTrace Foods \(1\)/ }).click();
  await page.getByText("Shared Test Product", { exact: true }).click();

  await expect(page).toHaveURL(
    new RegExp(`${APP_PATH}/biotrace-product/${BIO_TRACE_BARCODE}$`),
  );
  await expect(page.getByText("BioTrace product result", { exact: true })).toBeVisible();

  await page.getByText("Ask Assistant about this label", { exact: true }).click();
  const assistantContext = page.getByText("BioTrace label context", { exact: true }).locator("..");
  await expect(assistantContext).toBeVisible();
  await expect(assistantContext).toContainText("Shared Test Product");
});

test("organizes Discover filters with accessible advanced cuisine and nutrition options", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await completeOnboarding(page);

  const suggestions = page.getByRole("toolbar", { name: "Search suggestions" });
  await expect(suggestions).toBeVisible();
  const suggestionButtons = suggestions.getByRole("button");
  await expect(suggestionButtons).toHaveCount(6);
  for (let index = 0; index < await suggestionButtons.count(); index += 1) {
    const suggestion = suggestionButtons.nth(index);
    await suggestion.scrollIntoViewIfNeeded();
    await expect(suggestion).toBeVisible();
    const bounds = await suggestion.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(320);
  }

  await expect(page.getByText("Meal impact", { exact: true })).toBeVisible();
  await expect(page.getByTestId("impact-filter-good")).toHaveAttribute("aria-checked", "false");

  await page.getByTestId("impact-filter-good").click();
  await expect(page.getByTestId("impact-filter-good")).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("clear-filters")).toBeVisible();
  await expect(page.getByText("Showing Friendly", { exact: true })).toBeVisible();

  await page.getByTestId("more-filters").click();
  await expect(page.getByTestId("more-filters-modal")).toBeVisible();
  await expect(page.getByText("Cuisine", { exact: true })).toBeVisible();
  const casualAmericanCuisine = page.getByTestId("advanced-cuisine-casual-american");
  await casualAmericanCuisine.scrollIntoViewIfNeeded();
  await casualAmericanCuisine.click();
  await expect(casualAmericanCuisine).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Close more filters", exact: true }).last().click();
  await expect(page.getByText("Showing Friendly · Casual American", { exact: true })).toBeVisible();
  await expect(page.getByText("1 restaurant found", { exact: true })).toBeVisible();

  await page.getByTestId("more-filters").click();
  await expect(page.getByTestId("more-filters-modal")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Low Carb nutrition filter", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "High Protein nutrition filter", exact: true })).toBeVisible();

  const cuisineButtons = page.locator('[role="radio"][data-testid^="advanced-cuisine-"]');
  await expect(cuisineButtons).toHaveCount(24);
  for (let index = 0; index < await cuisineButtons.count(); index += 1) {
    const cuisineButton = cuisineButtons.nth(index);
    await cuisineButton.scrollIntoViewIfNeeded();
    await cuisineButton.click();
    await expect(cuisineButton).toHaveAttribute("aria-checked", "true");
  }

  await page.getByTestId("advanced-filter-low-carb").click();
  await expect(page.getByTestId("advanced-filter-low-carb")).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Close more filters", exact: true }).last().click();

  await page.getByTestId("clear-filters").click();
  await expect(page.getByTestId("clear-filters")).not.toBeVisible();
  await expect(page.getByText("Showing Friendly", { exact: true })).not.toBeVisible();

  const moreButton = page.getByTestId("more-filters");
  await moreButton.scrollIntoViewIfNeeded();
  const moreButtonBounds = await moreButton.boundingBox();
  expect(moreButtonBounds?.x).toBeGreaterThanOrEqual(0);
  expect((moreButtonBounds?.x ?? 0) + (moreButtonBounds?.width ?? 0)).toBeLessThanOrEqual(320);
});

test("opens and dismisses the upgrade modal from Scan Menu", async ({ page }) => {
  await completeOnboarding(page);

  await clickTab(page, "Scan");
  await page.getByRole("button", { name: "Scan a Restaurant Menu", exact: true }).click();
  await expect(page.getByText("Menu Scanner", { exact: true })).toBeVisible();

  const menuImageControl = page.getByRole("button", { name: /choose a menu image/i });
  await expect(menuImageControl).toBeVisible();
  await expect(menuImageControl).toHaveAttribute("aria-label", /choose a menu image/i);

  await page.getByText(/scans left|Limit reached/, { exact: false }).first().click();
  await expect(page.getByText("DiabEats Premium", { exact: true })).toBeVisible();
  await expect(page.getByTestId("close-paywall")).toBeVisible();

  await page.getByTestId("close-paywall").click();
  await expect(page.getByText("DiabEats Premium", { exact: true })).not.toBeVisible();
  await expect(menuImageControl).toBeVisible();
});

test("returns the Assistant composer to an editable state after streaming", async ({ page }) => {
  await completeOnboarding(page);
  await clickTab(page, "Assistant");

  await page.route("**/api/chat", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await route.fulfill({
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
      },
      body: `data: ${JSON.stringify({
        content: "Choose meals with fiber and protein, and compare portions when dining out.",
      })}\n\ndata: [DONE]\n\n`,
    });
  });

  const composer = page.getByRole("textbox", {
    name: "Message the AI Assistant",
    exact: true,
  });
  await composer.fill("What foods keep blood sugar stable?");
  await page.getByTestId("send-button").click();

  await expect(page.getByText("AI Data Sharing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /I Agree — Enable AI Features/i }).click();

  await expect(page.getByText("Getting your answer…", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/Choose meals with fiber and protein/, { exact: false }),
  ).toBeVisible();
  await expect(composer).toBeEditable();
  await expect(page.getByTestId("send-button")).toBeDisabled();
});

test("restores the Assistant composer after cancelling a response", async ({ page }) => {
  await completeOnboarding(page);
  await clickTab(page, "Assistant");

  let chatRequests = 0;
  let releaseFirstStream: (() => void) | undefined;
  const firstStreamReleased = new Promise<void>((resolve) => {
    releaseFirstStream = resolve;
  });

  await page.route("**/api/chat", async (route) => {
    chatRequests += 1;

    if (chatRequests === 1) {
      await firstStreamReleased;
      try {
        await route.fulfill({
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
          body: `data: ${JSON.stringify({ content: "This response was cancelled." })}\n\ndata: [DONE]\n\n`,
        });
      } catch {
        // The browser aborts this request when the user cancels the response.
      }
      return;
    }

    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
      body: `data: ${JSON.stringify({
        content: "Your next question was sent successfully after cancellation.",
      })}\n\ndata: [DONE]\n\n`,
    });
  });

  const composer = page.getByRole("textbox", {
    name: "Message the AI Assistant",
    exact: true,
  });
  await composer.fill("What should I ask the Assistant?");
  await page.getByTestId("send-button").click();

  await expect(page.getByText("AI Data Sharing", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /I Agree — Enable AI Features/i }).click();
  await expect(page.getByText("Getting your answer…", { exact: true })).toBeVisible();

  const stopButton = page.getByRole("button", {
    name: "Stop the response and start a new conversation",
    exact: true,
  });
  await expect(stopButton).toBeVisible();
  await stopButton.click();
  releaseFirstStream?.();

  await expect(composer).toBeEditable();
  await expect(page.getByText("This response was cancelled.", { exact: true })).not.toBeVisible();

  await composer.fill("Can I send another question now?");
  await page.getByTestId("send-button").click();
  await expect.poll(() => chatRequests).toBe(2);
  await expect(
    page.getByText("Your next question was sent successfully after cancellation.", { exact: true }),
  ).toBeVisible();
  await expect(composer).toBeEditable();
});