import assert from "node:assert/strict";
import { once } from "node:events";
import test from "node:test";
import express from "express";
import { eq, inArray } from "drizzle-orm";
import { db, ensureSecuritySchema } from "../server/db";
import { registerRoutes } from "../server/routes";
import {
  appSessions,
  biotraceProducts,
  biotraceUnclassifiedIngredients,
} from "../server/schema";
import { normalizedProductSchema } from "../shared/biotrace";

test("persists aggregate gaps and serves a protected, ranked admin report", async () => {
  await ensureSecuritySchema();

  const prefix = `test-gap-${process.pid}-${Date.now()}`;
  const barcode = "123456789012";
  const canonicalIds = [`en:${prefix}-first`, `en:${prefix}-second`];
  const genericCanonicalId = `en:${prefix}-generic`;
  const alternativeCanonicalId = `en:${prefix}-alternative`;
  const telemetryIds = [...canonicalIds, genericCanonicalId, alternativeCanonicalId];
  const telemetryKeys = telemetryIds.map((id) => `id:${id}`);
  const seededKeys = Array.from({ length: 105 }, (_, index) => `name:${prefix}-rank-${index}`);
  const allKeys = [...telemetryKeys, ...seededKeys];
  const previousAdminPassword = process.env.ADMIN_PASSWORD;
  process.env.ADMIN_PASSWORD = `${prefix}-admin`;

  const product = normalizedProductSchema.parse({
    barcode,
    name: "Telemetry Test Product",
    brand: null,
    quantity: null,
    categories: ["test category"],
    imageAvailable: false,
    ingredientsText: null,
    ingredientsStructured: [
      { id: canonicalIds[0], text: `${prefix} first` },
      { id: canonicalIds[1], text: `${prefix} second` },
      { id: "en:sugar", text: "Sugar" },
    ],
    nutrition: {
      servingSize: null,
      servingQuantityGrams: null,
      energyKcal: null,
      carbohydratesGrams: null,
      sugarsGrams: null,
      addedSugarsGrams: null,
      fiberGrams: null,
      proteinGrams: null,
      fatGrams: null,
      saturatedFatGrams: null,
      sodiumMilligrams: null,
      basis: "unknown",
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
    novaGroup: null,
    nutriScore: null,
    source: {
      provider: "open-food-facts",
      url: null,
      retrievedAt: new Date().toISOString(),
      completeness: null,
      freshness: "live",
    },
    resolution: {
      kind: "exact",
      evidenceType: "gtin",
      confidence: "provider-confirmed",
      confirmationRequired: false,
      explanation: "Test cache record.",
    },
  });

  await db
    .insert(biotraceProducts)
    .values({ barcode, name: product.name, brand: null, data: product, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: biotraceProducts.barcode,
      set: { data: product, fetchedAt: new Date() },
    });

  const app = express();
  app.use(express.json());
  const server = await registerRoutes(app);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const baseUrl = `http://127.0.0.1:${address.port}`;
  let revenueCatUserId: string | null = null;
  const originalFetch = globalThis.fetch;

  try {
    const unauthenticated = await fetch(`${baseUrl}/api/admin/biotrace/unclassified-ingredients`);
    assert.equal(unauthenticated.status, 401);

    const sessionResponse = await fetch(`${baseUrl}/api/auth/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{}",
    });
    assert.equal(sessionResponse.status, 201);
    const session = await sessionResponse.json() as { token: string; revenueCatUserId: string };
    revenueCatUserId = session.revenueCatUserId;

    for (let scan = 0; scan < 2; scan += 1) {
      const response = await fetch(`${baseUrl}/api/biotrace/product/${barcode}`, {
        headers: { authorization: `Bearer ${session.token}` },
      });
      assert.equal(response.status, 200);
    }

    const persisted = await db
      .select({
        canonicalId: biotraceUnclassifiedIngredients.canonicalId,
        count: biotraceUnclassifiedIngredients.count,
      })
      .from(biotraceUnclassifiedIngredients)
      .where(inArray(biotraceUnclassifiedIngredients.ingredientKey, telemetryKeys));
    assert.deepEqual(
      persisted.sort((a, b) => (a.canonicalId ?? "").localeCompare(b.canonicalId ?? "")),
      canonicalIds.map((canonicalId) => ({ canonicalId, count: 2 })),
    );

    const providerProduct = (
      name: string,
      code: string,
      canonicalId: string,
    ) => ({
      code,
      product_name: name,
      categories_tags: ["en:test-category"],
      ingredients_text: name,
      ingredients: [{ id: canonicalId, text: name }],
      nutriments: {
        "energy-kcal_100g": 100,
        carbohydrates_100g: 10,
        sugars_100g: 1,
        "added-sugars_100g": 0,
        fiber_100g: 5,
        proteins_100g: 5,
        fat_100g: 2,
        "saturated-fat_100g": 0.5,
        sodium_100g: 0.05,
      },
      serving_size: "100 g",
      serving_quantity: 100,
      nova_group: 1,
      nutriscore_grade: "a",
      completeness: 1,
    });
    const genericName = `${prefix} generic`;
    const genericProduct = providerProduct(
      genericName,
      "123456789013",
      genericCanonicalId,
    );
    const alternativeProduct = providerProduct(
      `${prefix} alternative`,
      "123456789014",
      alternativeCanonicalId,
    );

    globalThis.fetch = async (input, init) => {
      const url = typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
      if (url.startsWith(baseUrl)) return originalFetch(input, init);
      if (url.startsWith("https://world.openfoodfacts.org/cgi/search.pl?")) {
        const requestUrl = new URL(url);
        const body = requestUrl.searchParams.has("search_terms")
          ? { count: 1, products: [genericProduct] }
          : { count: 1, products: [alternativeProduct] };
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`Unexpected external request in telemetry test: ${url}`);
    };

    const searchResponse = await fetch(
      `${baseUrl}/api/biotrace/search?q=${encodeURIComponent(genericName)}`,
      { headers: { authorization: `Bearer ${session.token}` } },
    );
    assert.equal(searchResponse.status, 200);
    const searchResult = await searchResponse.json() as { generic: { kind: string } };
    assert.equal(searchResult.generic.kind, "product");

    const alternativesResponse = await fetch(
      `${baseUrl}/api/biotrace/alternatives/${barcode}`,
      { headers: { authorization: `Bearer ${session.token}` } },
    );
    assert.equal(alternativesResponse.status, 200);
    const alternativesResult = await alternativesResponse.json() as { alternatives: unknown[] };
    assert.equal(alternativesResult.alternatives.length, 1);

    const allPersisted = await db
      .select({
        canonicalId: biotraceUnclassifiedIngredients.canonicalId,
        count: biotraceUnclassifiedIngredients.count,
      })
      .from(biotraceUnclassifiedIngredients)
      .where(inArray(biotraceUnclassifiedIngredients.ingredientKey, telemetryKeys));
    assert.deepEqual(
      new Map(allPersisted.map((row) => [row.canonicalId, row.count])),
      new Map([
        [canonicalIds[0], 3],
        [canonicalIds[1], 3],
        [genericCanonicalId, 1],
        [alternativeCanonicalId, 1],
      ]),
    );

    await db.insert(biotraceUnclassifiedIngredients).values(
      seededKeys.map((ingredientKey, index) => ({
        ingredientKey,
        canonicalId: null,
        ingredientName: `${prefix}-rank-${index}`,
        count: 10_000 + index,
      })),
    );

    const adminHeaders = { authorization: `Bearer ${process.env.ADMIN_PASSWORD}` };
    const defaultResponse = await fetch(
      `${baseUrl}/api/admin/biotrace/unclassified-ingredients`,
      { headers: adminHeaders },
    );
    assert.equal(defaultResponse.status, 200);
    assert.equal(defaultResponse.headers.get("cache-control"), "no-store");
    const defaultReport = await defaultResponse.json() as {
      ingredients: Array<{ canonicalId: string | null; name: string; count: number }>;
    };
    assert.equal(defaultReport.ingredients.length, 100);

    const limitedResponse = await fetch(
      `${baseUrl}/api/admin/biotrace/unclassified-ingredients?limit=3`,
      { headers: adminHeaders },
    );
    assert.equal(limitedResponse.status, 200);
    const limitedReport = await limitedResponse.json() as typeof defaultReport;
    assert.deepEqual(
      limitedReport.ingredients,
      [104, 103, 102].map((index) => ({
        canonicalId: null,
        name: `${prefix}-rank-${index}`,
        count: 10_000 + index,
      })),
    );
  } finally {
    globalThis.fetch = originalFetch;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await db
      .delete(biotraceUnclassifiedIngredients)
      .where(inArray(biotraceUnclassifiedIngredients.ingredientKey, allKeys));
    await db.delete(biotraceProducts).where(eq(biotraceProducts.barcode, barcode));
    if (revenueCatUserId) {
      await db.delete(appSessions).where(eq(appSessions.revenueCatUserId, revenueCatUserId));
    }
    if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousAdminPassword;
  }
});