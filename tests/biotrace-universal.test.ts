import assert from "node:assert/strict";
import test from "node:test";

import {
  classifyBioTraceIdentifier,
  ProviderError,
  type NormalizedProduct,
} from "../shared/biotrace";
import {
  buildUnknownIdentifierResult,
  resolveBarcodeProduct,
  resolveGenericCandidates,
  resolveNamedGenericCandidates,
  type CachedProduct,
  type ProductCache,
} from "../server/services/biotrace-resolver";
import { lookupByBarcode } from "../server/services/open-food-facts";
import {
  lookupByBarcode as lookupWithFallback,
  searchByName as searchWithFallback,
} from "../server/services/biotrace-provider";
import { lookupByBarcode as lookupUsdaByBarcode } from "../server/services/usda-food-data";
import { computeBioTraceRating } from "../shared/biotrace-rating";

function product(name: string, overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return {
    barcode: "009800001234",
    name,
    brand: null,
    quantity: null,
    categories: ["fresh foods"],
    imageAvailable: false,
    ingredientsText: null,
    ingredientsStructured: null,
    nutrition: {
      servingSize: null,
      servingQuantityGrams: null,
      energyKcal: 40,
      carbohydratesGrams: 9,
      sugarsGrams: 6,
      addedSugarsGrams: 0,
      fiberGrams: 2,
      proteinGrams: 1,
      fatGrams: 0,
      saturatedFatGrams: 0,
      sodiumMilligrams: 2,
      basis: "100g",
    },
    ingredients: {
      sweeteners: [],
      additives: [],
      hasSweeteners: false,
      hasArtificialSweeteners: false,
      hasAdditives: false,
    },
    gmo: { status: "unknown", reason: "No GMO-related label was supplied.", signals: [] },
    labels: [],
    novaGroup: 1,
    nutriScore: "a",
    source: {
      provider: "open-food-facts",
      url: "https://world.openfoodfacts.org/product/009800001234",
      retrievedAt: "2026-08-28T12:00:00.000Z",
      completeness: 0.8,
      freshness: "live",
    },
    ...overrides,
  };
}

function memoryCache(initial: CachedProduct | null = null): ProductCache & { writes: NormalizedProduct[] } {
  let value = initial;
  const writes: NormalizedProduct[] = [];
  return {
    writes,
    async read() {
      return value;
    },
    async write(next) {
      writes.push(next);
      value = { product: next, fetchedAt: new Date("2026-08-28T12:00:00.000Z") };
    },
  };
}

function usdaSource(
  overrides: Partial<Extract<NormalizedProduct["source"], { provider: "usda-fooddata-central" }>> = {},
): Extract<NormalizedProduct["source"], { provider: "usda-fooddata-central" }> {
  return {
    provider: "usda-fooddata-central",
    url: "https://fdc.nal.usda.gov/food-details/12345/nutrients",
    retrievedAt: "2026-08-28T12:00:00.000Z",
    completeness: null,
    freshness: "live",
    fdcId: 12345,
    dataType: "Foundation",
    publicationDate: "2025-01-01",
    modifiedDate: null,
    ...overrides,
  };
}

function usdaProduct(name: string, overrides: Partial<NormalizedProduct> = {}): NormalizedProduct {
  return product(name, {
    source: usdaSource(),
    ...overrides,
  });
}

test("keeps camera barcodes, manual PLUs, and unsupported sticker values as separate evidence", () => {
  assert.deepEqual(classifyBioTraceIdentifier("009800001234", "camera"), {
    kind: "gtin",
    value: "009800001234",
    evidenceType: "gtin",
  });
  assert.deepEqual(classifyBioTraceIdentifier("4030", "manual"), {
    kind: "human-readable-plu",
    value: "4030",
    evidenceType: "human-readable-plu",
  });
  assert.equal(classifyBioTraceIdentifier("4030", "camera").kind, "unsupported");
  assert.equal(classifyBioTraceIdentifier("COSMIC-CRISP-STICKER", "camera").kind, "unsupported");
});

test("keeps the kiwi barcode as an exact provider-confirmed product", async () => {
  const cache = memoryCache();
  const kiwi = product("Kiwi");
  const result = await resolveBarcodeProduct({
    barcode: "009800001234",
    cache,
    lookup: async () => kiwi,
    now: new Date("2026-08-28T12:00:00.000Z"),
  });

  assert.equal(result.name, "Kiwi");
  assert.equal(result.resolution?.kind, "exact");
  assert.equal(result.resolution?.confidence, "provider-confirmed");
  assert.equal(result.resolution?.evidenceType, "gtin");
  assert.equal(cache.writes.length, 1);
});

test("returns yellow onion as a generic provider-supported name match", () => {
  const result = resolveGenericCandidates("yellow onion", [product("Yellow Onion")]);
  assert.equal(result.kind, "generic");
  if (result.kind !== "generic") return;
  assert.equal(result.product.barcode, null);
  assert.equal(result.product.resolution?.kind, "generic");
  assert.equal(result.product.resolution?.confidence, "provider-supported");
  assert.equal(result.product.resolution?.confirmationRequired, true);
});

test("uses provider name evidence for Cosmic Crisp without treating the sticker as a PLU", () => {
  const result = resolveGenericCandidates("Cosmic Crisp", [
    product("Cosmic Crisp", { brand: "Cosmic Crisp" }),
  ]);
  assert.equal(result.kind, "generic");
  if (result.kind !== "generic") return;
  assert.equal(result.product.resolution?.evidenceType, "provider-name-match");
  assert.equal(result.product.resolution?.confirmationRequired, true);
});

test("conflicting exact-name provider records require confirmation", () => {
  const result = resolveGenericCandidates("Yellow Onion", [
    product("Yellow Onion", { brand: "Farm A" }),
    product("Yellow Onion", {
      brand: "Farm B",
      nutrition: { ...product("Yellow Onion").nutrition, carbohydratesGrams: 14 },
    }),
  ]);
  assert.equal(result.kind, "confirmation-required");
});

test("an unknown barcode stays unknown with explicit recovery actions", async () => {
  const unknown = buildUnknownIdentifierResult("99999999999999");
  assert.equal(unknown.resolution.kind, "unknown");
  assert.equal(unknown.resolution.confidence, "unknown");
  assert.deepEqual(unknown.recoveryActions, ["search-by-name", "label-photo", "manual-entry"]);
  assert.match(unknown.resolution.explanation, /did not guess/i);

  await assert.rejects(
    resolveBarcodeProduct({
      barcode: unknown.identifier,
      cache: memoryCache(),
      lookup: async () => {
        throw new ProviderError("not_found", "No product found.");
      },
    }),
    (error: unknown) => error instanceof ProviderError && error.kind === "not_found",
  );
});

test("maps an Open Food Facts HTTP 404 to not_found for the unknown route state", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ status: 0 }), { status: 404 });
  try {
    await assert.rejects(
      lookupByBarcode("99999999999999"),
      (error: unknown) => error instanceof ProviderError && error.kind === "not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fresh cache avoids duplicate provider calls", async () => {
  let lookups = 0;
  const cached = product("Cached Kiwi");
  const result = await resolveBarcodeProduct({
    barcode: cached.barcode!,
    cache: memoryCache({ product: cached, fetchedAt: new Date("2026-08-28T11:30:00.000Z") }),
    lookup: async () => {
      lookups += 1;
      return product("Live Kiwi");
    },
    now: new Date("2026-08-28T12:00:00.000Z"),
  });
  assert.equal(result.name, "Cached Kiwi");
  assert.equal(result.source.freshness, "fresh-cache");
  assert.equal(lookups, 0);
});

test("stale cache is used only for temporary provider failures", async () => {
  const cached = product("Recently cached onion");
  const cache = memoryCache({ product: cached, fetchedAt: new Date("2026-08-26T12:00:00.000Z") });
  const result = await resolveBarcodeProduct({
    barcode: cached.barcode!,
    cache,
    lookup: async () => {
      throw new ProviderError("timeout", "Timed out");
    },
    now: new Date("2026-08-28T12:00:00.000Z"),
  });
  assert.equal(result.source.freshness, "stale-cache");

  await assert.rejects(
    resolveBarcodeProduct({
      barcode: cached.barcode!,
      cache,
      lookup: async () => {
        throw new ProviderError("not_found", "No product found.");
      },
      now: new Date("2026-08-28T12:00:00.000Z"),
    }),
    (error: unknown) => error instanceof ProviderError && error.kind === "not_found",
  );
});

test("Open Food Facts remains first and USDA supplies an exact branded GTIN fallback", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    const url = String(input);
    requested.push(url);
    if (url.includes("openfoodfacts.org")) {
      return new Response(JSON.stringify({ status: 0 }), { status: 404 });
    }
    if (url.includes("/foods/search")) {
      return Response.json({
        foods: [{
          fdcId: 424242,
          dataType: "Branded",
          description: "PLAIN GREEK YOGURT",
          brandOwner: "Example Dairy",
          gtinUpc: "009800001234",
        }],
      });
    }
    return Response.json({
      fdcId: 424242,
      dataType: "Branded",
      description: "PLAIN GREEK YOGURT",
      brandOwner: "Example Dairy",
      gtinUpc: "009800001234",
      servingSize: 170,
      servingSizeUnit: "g",
      publishedDate: "2026-01-15",
      modifiedDate: "2026-02-01",
      labelNutrients: {
        calories: { value: 100 },
        carbohydrates: { value: 6 },
        sugars: { value: 4 },
        addedSugars: { value: 0 },
        fiber: { value: 0 },
        protein: { value: 17 },
        fat: { value: 0 },
        saturatedFat: { value: 0 },
        sodium: { value: 55 },
      },
    });
  };
  try {
    const resolved = await lookupWithFallback("009800001234");
    assert.equal(requested.length, 3);
    assert.match(requested[0], /openfoodfacts/u);
    assert.match(requested[1], /api\.nal\.usda\.gov/u);
    assert.equal(resolved.source.provider, "usda-fooddata-central");
    assert.equal(resolved.resolution?.kind, "exact");
    assert.equal(resolved.nutrition.basis, "serving");
    assert.equal(resolved.nutrition.proteinGrams, 17);
    assert.doesNotMatch(JSON.stringify(resolved), /unit-test-key/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("USDA accepts only the UPC-A and zero-padded GTIN-14 forms of the same code", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  let requestedDetail = false;
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/foods/search")) {
      return Response.json({ foods: [{ fdcId: 45, dataType: "Branded", description: "PEPSI COLA", gtinUpc: "012000000133" }] });
    }
    requestedDetail = true;
    return Response.json({ fdcId: 45, dataType: "Branded", description: "PEPSI COLA", gtinUpc: "012000000133" });
  };
  try {
    const resolved = await lookupUsdaByBarcode("00012000000133");
    assert.equal(resolved.barcode, "00012000000133");
    assert.equal(resolved.name, "PEPSI COLA");
    assert.equal(requestedDetail, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("USDA sweetener evidence overrides zero or missing added-sugar values in ratings", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  try {
    for (const example of [
      { barcode: "012345678905", ingredients: "WATER, GLUCOSE SYRUP", addedSugars: { value: 0 } },
      { barcode: "012345678912", ingredients: "WATER, MOLASSES, FRUIT JUICE CONCENTRATE", addedSugars: undefined },
    ]) {
      let request = 0;
      globalThis.fetch = async () => {
        request += 1;
        if (request === 1) {
          return Response.json({
            foods: [{ fdcId: 90, dataType: "Branded", description: "TEST FOOD", gtinUpc: example.barcode }],
          });
        }
        return Response.json({
          fdcId: 90,
          dataType: "Branded",
          description: "TEST FOOD",
          gtinUpc: example.barcode,
          ingredients: example.ingredients,
          servingSize: 30,
          servingSizeUnit: "g",
          labelNutrients: {
            carbohydrates: { value: 20 },
            sugars: { value: 10 },
            addedSugars: example.addedSugars,
            saturatedFat: { value: 0 },
            sodium: { value: 10 },
          },
        });
      };
      const resolved = await lookupUsdaByBarcode(example.barcode);
      const addedSugar = computeBioTraceRating(resolved).factors.find((factor) => factor.key === "added-sugars");
      assert.equal(addedSugar?.label, "Contains added sugars or sweeteners");
      assert.equal(resolved.ingredients.hasSweeteners, true);
    }
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("OFF miss plus USDA miss remains a typed not_found without disclosing the USDA key", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  const requested: string[] = [];
  globalThis.fetch = async (input) => {
    requested.push(String(input));
    return String(input).includes("openfoodfacts.org")
      ? new Response(JSON.stringify({ status: 0 }), { status: 404 })
      : Response.json({ foods: [] });
  };
  try {
    await assert.rejects(
      lookupWithFallback("012000001536"),
      (error: unknown) => error instanceof ProviderError && error.kind === "not_found" && !error.message.includes("unit-test-key"),
    );
    assert.equal(requested.some((url) => url.includes("unit-test-key")), true);
    assert.doesNotMatch(JSON.stringify(new ProviderError("not_found", "No product found.")), /unit-test-key/u);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("USDA generic search preserves data type and requires confirmation", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("openfoodfacts.org")) return Response.json({ count: 0, products: [] });
    return Response.json({
      foods: [{
        fdcId: 11111,
        dataType: "Foundation",
        description: "Onions, yellow, raw",
        publishedDate: "2025-04-01",
        foodNutrients: [
          { nutrientNumber: "205", amount: 9.3 },
          { nutrientNumber: "269", amount: 4.2 },
          { nutrientNumber: "291", amount: 1.7 },
          { nutrientNumber: "203", amount: 1.1 },
          { nutrientNumber: "307", amount: 4 },
        ],
      }],
    });
  };
  try {
    const search = await searchWithFallback("yellow onion", 1, 12);
    assert.equal(search.genericResolution.kind, "generic");
    if (search.genericResolution.kind !== "generic") return;
    assert.equal(search.genericResolution.product.barcode, null);
    assert.equal(search.genericResolution.product.source.provider, "usda-fooddata-central");
    assert.equal(search.genericResolution.product.source.dataType, "Foundation");
    assert.equal(search.genericResolution.product.resolution?.confirmationRequired, true);
    assert.match(search.genericResolution.product.resolution?.explanation ?? "", /USDA FoodData Central/u);
    assert.equal(search.genericResolution.product.nutrition.basis, "100g");
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("materially different USDA name matches remain confirmation-required", () => {
  const result = resolveNamedGenericCandidates("yellow onion", [
    usdaProduct("Onions, yellow, raw"),
    usdaProduct("Yellow onions, cooked", {
      source: usdaSource({ fdcId: 22222 }),
      nutrition: { ...product("Yellow onions, cooked").nutrition, carbohydratesGrams: 12 },
    }),
  ], "USDA FoodData Central");
  assert.equal(result.kind, "confirmation-required");
});

test("USDA generic matching rejects partial-word collisions", () => {
  const result = resolveNamedGenericCandidates(
    "red",
    [usdaProduct("Shredded yellow onions")],
    "USDA FoodData Central",
  );
  assert.equal(result.kind, "unknown");
});

test("USDA rate limits and malformed detail records are explicit provider failures", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  try {
    globalThis.fetch = async () => new Response("{}", { status: 429 });
    await assert.rejects(
      lookupUsdaByBarcode("009800001234"),
      (error: unknown) => error instanceof ProviderError && error.kind === "rate_limited",
    );

    let request = 0;
    globalThis.fetch = async () => {
      request += 1;
      return request === 1
        ? Response.json({ foods: [{ fdcId: 42, dataType: "Branded", gtinUpc: "009800001234" }] })
        : Response.json({});
    };
    await assert.rejects(
      lookupUsdaByBarcode("009800001234"),
      (error: unknown) => error instanceof ProviderError && error.kind === "provider_unavailable",
    );

    globalThis.fetch = async () => Response.json({ totalHits: 1 });
    await assert.rejects(
      lookupUsdaByBarcode("009800001234"),
      (error: unknown) => error instanceof ProviderError && error.kind === "provider_unavailable",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("USDA never treats a different leading-zero barcode as an exact match", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  globalThis.fetch = async () => Response.json({
    foods: [{
      fdcId: 77,
      dataType: "Branded",
      description: "Different product",
      gtinUpc: "00012345678",
    }],
  });
  try {
    await assert.rejects(
      lookupUsdaByBarcode("12345678"),
      (error: unknown) => error instanceof ProviderError && error.kind === "not_found",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("USDA rejects malformed search GTINs and contradictory detail GTINs", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.USDA_API_KEY;
  process.env.USDA_API_KEY = "unit-test-key";
  try {
    globalThis.fetch = async () => Response.json({
      foods: [{
        fdcId: 77,
        dataType: "Branded",
        description: "Malformed product",
        gtinUpc: "12345678unexpected",
      }],
    });
    await assert.rejects(
      lookupUsdaByBarcode("12345678"),
      (error: unknown) => error instanceof ProviderError && error.kind === "not_found",
    );

    let request = 0;
    globalThis.fetch = async () => {
      request += 1;
      return request === 1
        ? Response.json({ foods: [{ fdcId: 88, dataType: "Branded", gtinUpc: "12345678" }] })
        : Response.json({ fdcId: 88, dataType: "Branded", gtinUpc: "87654321" });
    };
    await assert.rejects(
      lookupUsdaByBarcode("12345678"),
      (error: unknown) => error instanceof ProviderError && error.kind === "provider_unavailable",
    );
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.USDA_API_KEY;
    else process.env.USDA_API_KEY = originalKey;
  }
});

test("a fresh USDA cache entry cannot bypass the Open Food Facts-first lookup order", async () => {
  let lookups = 0;
  const cachedUsda = usdaProduct("Cached USDA yogurt", {
    barcode: "009800001234",
    source: usdaSource({ dataType: "Branded" }),
  });
  const result = await resolveBarcodeProduct({
    barcode: "009800001234",
    cache: memoryCache({ product: cachedUsda, fetchedAt: new Date("2026-08-28T11:30:00.000Z") }),
    lookup: async () => {
      lookups += 1;
      return product("Open Food Facts yogurt");
    },
    now: new Date("2026-08-28T12:00:00.000Z"),
  });
  assert.equal(lookups, 1);
  assert.equal(result.source.provider, "open-food-facts");
});

test("concurrent identical barcode resolutions share one provider request", async () => {
  let lookups = 0;
  const cache = memoryCache();
  const lookup = async () => {
    lookups += 1;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return product("Shared provider result");
  };
  const input = {
    barcode: "009800001234",
    cache,
    lookup,
    now: new Date("2026-08-28T12:00:00.000Z"),
  };
  const [first, second] = await Promise.all([
    resolveBarcodeProduct(input),
    resolveBarcodeProduct(input),
  ]);
  assert.equal(lookups, 1);
  assert.equal(first.name, second.name);
});