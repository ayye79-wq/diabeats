import type { Express, Request, Response } from "express";
import { createServer, type Server } from "node:http";
import { openai } from "./openai";
import { db } from "./db";
import {
  aiUsage,
  appSessions,
  restaurants,
  menuItems,
  orders,
  orderItems,
  referralClicks,
  userEvents,
  userFeedback,
  biotraceProducts,
  biotraceScans,
  biotraceSavedFoods,
  biotraceCorrections,
} from "./schema";
import { eq, desc, and, inArray } from "drizzle-orm";
import { RESTAURANTS } from "../data/restaurants";
import { z } from "zod";
import {
  AI_DISCLAIMER,
  AI_VERIFICATION,
  MEDICAL_TREATMENT_RESPONSE,
  URGENT_HEALTH_RESPONSE,
  aiMenuResultSchema,
  assertSafeEducationalText,
  bestMealResultSchema,
  chatEventSchema,
  containsUnsafeMedicalAdvice,
  isMedicalTreatmentQuestion,
  isUrgentHealthQuestion,
  makeEvidence,
  mealAnalysisSchema,
  safeParseAiJson,
  scanResultSchema,
  simulationResultSchema,
} from "../shared/ai-safety";
import {
  aiRateLimit,
  consumeAiQuota,
  createSession,
  productLookupRateLimit,
  requireAdmin,
  requireSession,
  sessionCreationRateLimit,
} from "./security";
import { barcodeSchema, ProviderError, type NormalizedProduct } from "../shared/biotrace";
import { computeBioTraceRating } from "../shared/biotrace-rating";
import { lookupByBarcode, searchByName } from "./services/open-food-facts";
import { findAlternatives } from "./services/biotrace-alternatives";

export async function registerRoutes(app: Express): Promise<Server> {
  const AI_QUESTION_LIMIT = 5;
  const SCAN_LIMIT = 3;
  const currentDate = () => new Date().toISOString().slice(0, 10);
  const boundedJson = z.unknown().refine(
    (value) => JSON.stringify(value).length <= 20_000,
    "Request data is too large",
  );
  const messageSchema = z.object({
    role: z.enum(["user", "assistant"]),
    content: z.string().trim().min(1).max(1_500),
  });
  const aiResponseEvidence = (source: string, basis: string, verified = false) =>
    makeEvidence(source, basis, verified);

  function validate<T>(schema: z.ZodType<T>, body: unknown, res: Response): T | null {
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      res.status(400).json({ error: "Invalid request.", details: parsed.error.flatten() });
      return null;
    }
    return parsed.data;
  }

  app.post("/api/auth/session", sessionCreationRateLimit, async (req: Request, res: Response) => {
    try {
      const { token, session, expiresAt } = await createSession(req);
      res.status(201).json({
        token,
        expiresAt: expiresAt.toISOString(),
        revenueCatUserId: session.revenueCatUserId,
      });
    } catch (error) {
      console.error("Session creation failed:", error);
      res.status(503).json({ error: "Authentication is temporarily unavailable." });
    }
  });

  app.get("/api/subscription", requireSession, async (req: Request, res: Response) => {
    try {
      const usageRows = await db
        .select({ feature: aiUsage.feature, count: aiUsage.count })
        .from(aiUsage)
        .where(and(eq(aiUsage.sessionId, req.sessionIdentity!.id), eq(aiUsage.usageDate, currentDate())));
      const usage = Object.fromEntries(usageRows.map((row) => [row.feature, row.count]));
      res.json({
        isPremium: req.sessionIdentity!.isPremium,
        revenueCatUserId: req.sessionIdentity!.revenueCatUserId,
        usage: {
          aiQuestions: usage.ai ?? 0,
          scans: usage.scan ?? 0,
        },
        limits: { aiQuestions: AI_QUESTION_LIMIT, scans: SCAN_LIMIT },
      });
    } catch (error) {
      console.error("Subscription status error:", error);
      res.status(500).json({ error: "Failed to load subscription status." });
    }
  });

  app.post("/api/subscription/webhook", async (req: Request, res: Response) => {
    const webhookSecret = process.env.REVENUECAT_WEBHOOK_AUTH;
    const authorization = req.header("authorization");
    if (!webhookSecret || authorization !== `Bearer ${webhookSecret}`) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const payload = validate(
      z.object({
        event: z.object({
          app_user_id: z.string().trim().min(1).max(255),
          type: z.string().trim().min(1).max(80),
          expiration_at_ms: z.number().nullable().optional(),
        }),
      }),
      req.body,
      res,
    );
    if (!payload) return;

    try {
      const eventType = payload.event.type.toUpperCase();
      const expiresAt = payload.event.expiration_at_ms ?? 0;
      const staysActiveUntilExpiration = eventType === "CANCELLATION" && expiresAt > Date.now();
      const isPremium =
        staysActiveUntilExpiration ||
        ["INITIAL_PURCHASE", "RENEWAL", "UNCANCELLATION", "PRODUCT_CHANGE", "SUBSCRIPTION_EXTENDED"].includes(eventType);

      await db
        .update(appSessions)
        .set({ isPremium })
        .where(eq(appSessions.revenueCatUserId, payload.event.app_user_id));
      res.json({ ok: true });
    } catch (error) {
      console.error("RevenueCat webhook error:", error);
      res.status(500).json({ error: "Could not update subscription status." });
    }
  });

  app.get("/api/restaurants", async (_req: Request, res: Response) => {
    try {
      // Always use static RESTAURANTS as the source of truth for IDs and menu structure
      res.json(RESTAURANTS);
    } catch (err) {
      console.error("GET /api/restaurants error:", err);
      res.status(500).json({ error: "Failed to fetch restaurants" });
    }
  });

  app.get("/api/restaurants/:id", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Always use static RESTAURANTS as source of truth — IDs are canonical here
      const staticRestaurant = RESTAURANTS.find((r) => r.id === id);
      if (staticRestaurant) {
        return res.json(staticRestaurant);
      }

      return res.status(404).json({ error: "Restaurant not found" });
    } catch (err) {
      console.error("GET /api/restaurants/:id error:", err);
      res.status(500).json({ error: "Failed to fetch restaurant" });
    }
  });

  app.post("/api/search", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(z.object({ query: z.string().trim().min(1).max(200) }), req.body, res);
      if (!input) return;
      const quota = await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT);
      if (!quota) return;
      const { query } = input;

      // Always use static RESTAURANTS as source of truth for IDs
      const allRestaurants = RESTAURANTS;
      const allMenuItems = RESTAURANTS.flatMap((r) =>
        r.menuItems.map((m) => ({
          id: m.id, restaurantId: r.id, name: m.name,
          description: m.description, category: m.category,
          price: m.price, diabeticScore: m.diabeticScore,
          carbRange: m.carbRange, nutrients: m.nutrients as any,
          quickTip: m.quickTip,
        }))
      );

      const knownRestaurantNames = allRestaurants.map((r) => r.name.toLowerCase());

      const intentPrompt = `You are a diabetes-aware food search engine. A user typed a natural language food query. Extract structured search intent.

User query: "${query}"

Respond with JSON:
{
  "summary": "Short description of what the user wants (max 8 words)",
  "scores": ["good", "caution", "avoid"] (subset — which diabetic ratings to include. 'low carb', 'diabetes-friendly', 'healthy' = ["good"]; 'moderate' = ["good","caution"]; 'anything' or unspecified = ["good","caution"]),
  "maxCarbsGrams": number or null (only set for explicit carb limits: 'low carb'=30, 'very low carb'=15, 'keto'=20, 'under Xg'=X; otherwise null),
  "keywords": ["1-5 food or ingredient keywords to match against dish names and descriptions — use specific ingredient words not meal-time words like 'dinner' or 'lunch'"],
  "isHealthIntent": true if the query contains health/nutrition language, false if it is a simple food name search,
  "mentionedRestaurant": "If the query mentions a specific restaurant or chain name (e.g. 'Hangry Joe's', 'Chipotle', 'McDonald's'), return that name exactly as written. Otherwise return null."
}`;

      const intentResponse = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: intentPrompt }],
        response_format: { type: "json_object" },
      });

      const intent = safeParseAiJson(
        z.object({
          summary: z.string().trim().min(1).max(80),
          scores: z.array(z.enum(["good", "caution", "avoid"])).min(1).max(3),
          maxCarbsGrams: z.number().finite().min(1).max(250).nullable(),
          keywords: z.array(z.string().trim().min(1).max(40)).max(5),
          isHealthIntent: z.boolean(),
          mentionedRestaurant: z.string().trim().min(1).max(160).nullable(),
        }).strict(),
        intentResponse.choices[0]?.message?.content || "{}",
      );

      const scoreSet = new Set<string>(intent.scores ?? ["good", "caution"]);
      const keywords: string[] = intent.keywords ?? [];
      const maxCarbs: number | null = intent.maxCarbsGrams ?? null;

      const parseMaxCarbs = (carbRange: string | null): number | null => {
        if (!carbRange) return null;
        const numbers = carbRange.match(/\d+/g);
        if (!numbers || numbers.length === 0) return null;
        return Math.max(...numbers.map(Number));
      };

      const scored = allMenuItems
        .filter((m) => {
          if (!scoreSet.has(m.diabeticScore ?? "")) return false;
          if (maxCarbs !== null) {
            const itemCarbs = parseMaxCarbs(m.carbRange);
            if (itemCarbs !== null && itemCarbs > maxCarbs) return false;
          }
          return true;
        })
        .map((m) => {
          const restaurant = allRestaurants.find((r) => r.id === m.restaurantId);
          const text = `${m.name} ${m.description} ${m.category}`.toLowerCase();
          const keywordScore = keywords.reduce(
            (acc, kw) => acc + (text.includes(kw.toLowerCase()) ? 2 : 0),
            0
          );
          const scoreBonus = m.diabeticScore === "good" ? 1 : 0;
          return { item: m, restaurant, relevance: keywordScore + scoreBonus };
        })
        .filter((r) => r.restaurant !== undefined)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, 15)
        .map(({ item: m, restaurant: r }) => ({
          item: {
            id: m.id,
            name: m.name,
            description: m.description,
            category: m.category,
            price: m.price,
            diabeticScore: m.diabeticScore,
            carbRange: m.carbRange,
            nutrients: m.nutrients,
            quickTip: m.quickTip,
          },
          restaurant: {
            id: r!.id,
            name: r!.name,
            cuisine: r!.cuisine,
            distance: r!.distance,
            rating: r!.rating,
          },
        }));

      const mentionedRestaurant: string | null = intent.mentionedRestaurant ?? null;
      const restaurantNotFound =
        mentionedRestaurant !== null &&
        !knownRestaurantNames.some((name) =>
          name.includes(mentionedRestaurant.toLowerCase())
        );

      res.json({
        intent: {
          summary: intent.summary ?? "Search results",
          criteria: intent.scores ?? [],
          isHealthIntent: intent.isHealthIntent ?? false,
          mentionedRestaurant: mentionedRestaurant,
          restaurantNotFound,
        },
        results: scored,
      });
    } catch (err) {
      console.error("Search error:", err);
      res.status(500).json({ error: "Search failed" });
    }
  });

  app.post("/api/meal-analysis", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(
        z.object({
          mealName: z.string().trim().min(1).max(160),
          description: z.string().trim().max(2_000).default(""),
          nutrients: boundedJson.optional().default({}),
          diabeticScore: z.string().trim().max(30).default(""),
        }),
        req.body,
        res,
      );
      if (!input) return;
      if (!(await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT, true))) return;
      const { mealName, description, nutrients, diabeticScore } = input;

      const prompt = `You are an educational nutrition assistant. Provide non-diagnostic restaurant meal guidance for a person managing diabetes or prediabetes. Do not claim clinical credentials, predict an individual's glucose, diagnose, or give medication advice. Use cautious language such as "may" and "can vary."

Meal: ${mealName}
Description: ${description}
Nutritional Profile: ${JSON.stringify(nutrients)}
Initial Rating: ${diabeticScore}

Provide a detailed analysis in JSON format with these exact fields:
{
  "headline": "A concise educational summary (max 15 words)",
  "bloodSugarImpact": "Qualitative carbohydrate context (e.g., 'Lower-carb option; individual response varies')",
  "glycemicExplanation": "2-3 sentences explaining WHY this meal affects blood sugar the way it does, using plain language",
  "positives": ["up to 3 positive aspects for diabetics, each max 12 words"],
  "concerns": ["up to 3 concerns for diabetics, each max 12 words"],
  "orderingTips": ["2-3 specific actionable tips when ordering this dish, each max 15 words"],
  "betterAlternative": "One sentence suggesting what to order instead, or null if this is already a good choice"
}

Base every point only on the supplied meal details. Do not present estimates as verified nutrition.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const model = safeParseAiJson(
        z.object({
          headline: z.string().trim().min(1).max(180),
          bloodSugarImpact: z.string().trim().min(1).max(160),
          glycemicExplanation: z.string().trim().min(1).max(900),
          positives: z.array(z.string().trim().min(1).max(160)).max(3),
          concerns: z.array(z.string().trim().min(1).max(160)).max(3),
          orderingTips: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
          betterAlternative: z.string().trim().min(1).max(220).nullable(),
        }).strict(),
        content,
      );
      assertSafeEducationalText(model);
      const analysis = mealAnalysisSchema.parse({
        ...model,
        confidence: "medium",
        informationUsed: [
          `Menu item: ${mealName}`,
          description ? `Description: ${description}` : "No meal description supplied",
          `Listed nutrition: ${JSON.stringify(nutrients).slice(0, 240)}`,
          diabeticScore ? `Existing DiabEats label: ${diabeticScore}` : "No existing DiabEats label supplied",
        ],
        limitations: "Portions, preparation, substitutions, and your individual glucose response can vary.",
        verification: AI_VERIFICATION,
        evidence: aiResponseEvidence("DiabEats menu data + AI educational summary", "Uses the meal details supplied by DiabEats; nutrition was not independently verified for this response."),
      });
      res.json(analysis);
    } catch (err) {
      console.error("Meal analysis error:", err);
      res.status(500).json({ error: "Failed to analyze meal" });
    }
  });

  app.post("/api/simulate-impact", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(
        z.object({
          restaurantName: z.string().trim().min(1).max(160),
          mealName: z.string().trim().min(1).max(160),
          nutrients: boundedJson.optional().default({}),
          carbRange: z.string().trim().max(100).default(""),
          selectedComponents: z.array(z.string().trim().min(1).max(100)).max(30).optional().default([]),
          removedComponents: z.array(z.string().trim().min(1).max(100)).max(30).optional().default([]),
        }),
        req.body,
        res,
      );
      if (!input) return;
      if (!(await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT, true))) return;
      const { restaurantName, mealName, nutrients, carbRange, selectedComponents, removedComponents } = input;

      const prompt = `You are an educational nutrition assistant. Describe relative carbohydrate impact for this restaurant meal without predicting a person's blood glucose, giving treatment advice, or claiming certainty. Do not use mg/dL values.

Restaurant: ${restaurantName}
Meal: ${mealName}
Base nutritional info: ${JSON.stringify(nutrients)}
Estimated carb range: ${carbRange}
Ingredients they WILL eat: ${selectedComponents?.join(", ") || "all standard ingredients"}
Ingredients they REMOVED: ${removedComponents?.length ? removedComponents.join(", ") : "none"}

Describe the relative carbohydrate impact of this customized meal. Individual glucose responses vary with medication, timing, activity, health, portion size, and many other factors.

Respond ONLY in JSON:
{
  "impactLevel": <"low" | "moderate" | "high", a qualitative comparison of carbohydrate load only>,
  "confidence": <"low" | "medium" | "high" based on how precisely the nutrients are known>,
  "reasoning": "<2-3 sentences explaining the key factors driving this prediction, mentioning specific ingredients>",
  "betterOption": "<One specific concrete suggestion to further reduce impact, or null if meal is already optimized>"
}

Use cautious terms such as "may" and "could." Be specific about which ingredients contribute carbohydrate; account for removals and additions.`;

      const response = await openai.chat.completions.create({
        model: "gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content || "{}";
      const model = safeParseAiJson(
        z.object({
          impactLevel: z.enum(["low", "moderate", "high"]),
          confidence: z.enum(["low", "medium", "high"]),
          reasoning: z.string().trim().min(1).max(900),
          betterOption: z.string().trim().min(1).max(220).nullable(),
        }).strict(),
        content,
      );
      assertSafeEducationalText(model);
      const result = simulationResultSchema.parse({
        ...model,
        informationUsed: [
          `Restaurant: ${restaurantName}`,
          `Meal: ${mealName}`,
          `Listed carb range: ${carbRange || "not supplied"}`,
          `Included: ${(selectedComponents ?? []).join(", ") || "standard ingredients"}`,
          `Removed: ${(removedComponents ?? []).join(", ") || "none"}`,
        ],
        limitations: "This is a qualitative food comparison, not a glucose prediction. Portion sizes, preparation, medication, activity, and your body can change your response.",
        verification: AI_VERIFICATION,
        evidence: aiResponseEvidence("DiabEats meal inputs + AI qualitative comparison", "Uses listed meal details and selected changes; does not use glucose monitoring data or a verified nutrition database."),
      });
      res.json(result);
    } catch (err) {
      console.error("Simulate impact error:", err);
      res.status(500).json({ error: "Failed to simulate impact" });
    }
  });

  app.post("/api/orders", requireSession, async (req: Request, res: Response) => {
    try {
      const {
        restaurantId,
        restaurantName,
        items,
        total,
        deliveryName,
        deliveryAddress,
        deliveryPhone,
        notes,
        orderType,
      } = req.body;

      if (!restaurantId || !items?.length || !deliveryName) {
        return res.status(400).json({ error: "Missing required order fields" });
      }

      const isPickup = orderType === "pickup";
      const orderId = `${isPickup ? "PU" : "DE"}-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const estimatedMinutes = isPickup
        ? Math.floor(Math.random() * 10) + 10
        : Math.floor(Math.random() * 20) + 25;

      await db.insert(orders).values({
        id: orderId,
        sessionId: req.sessionIdentity!.id,
        restaurantId,
        restaurantName,
        deliveryName,
        deliveryAddress: deliveryAddress || "",
        deliveryPhone: deliveryPhone || "",
        notes: notes || "",
        total,
        status: "placed",
        orderType: isPickup ? "pickup" : "delivery",
        estimatedMinutes,
      });

      if (items?.length) {
        await db.insert(orderItems).values(
          items.map((item: any) => ({
            orderId,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            diabeticScore: item.diabeticScore || "good",
          }))
        );
      }

      console.log(`Order placed: ${orderId} from ${restaurantName} — ${items.length} items — ${total}`);

      res.status(201).json({
        id: orderId,
        restaurantId,
        restaurantName,
        status: "placed",
        placedAt: new Date().toISOString(),
        estimatedMinutes,
      });
    } catch (err) {
      console.error("Order placement error:", err);
      res.status(500).json({ error: "Failed to place order" });
    }
  });

  app.get("/api/orders", requireSession, async (req: Request, res: Response) => {
    try {
      const allOrders = await db
        .select()
        .from(orders)
        .where(eq(orders.sessionId, req.sessionIdentity!.id))
        .orderBy(orders.placedAt);

      const allOrderItems = await db.select().from(orderItems);

      const result = allOrders.map((o) => ({
        ...o,
        items: allOrderItems
          .filter((i) => i.orderId === o.id)
          .map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, diabeticScore: i.diabeticScore })),
      }));

      res.json(result);
    } catch (err) {
      console.error("GET /api/orders error:", err);
      res.status(500).json({ error: "Failed to fetch orders" });
    }
  });

  app.post("/api/request-restaurant", async (req: Request, res: Response) => {
    try {
      const { name, city } = req.body;
      if (!name) {
        return res.status(400).json({ error: "Restaurant name is required" });
      }
      console.log(`[RESTAURANT REQUEST] Name: ${name} | City: ${city || "Not specified"}`);
      // In a real app, we'd save this to a database table.
      // For now, logging to console as per requirements.
      res.json({ success: true, message: "Request received" });
    } catch (error) {
      console.error("POST /api/request-restaurant error:", error);
      res.status(500).json({ error: "Failed to submit request" });
    }
  });

  app.post("/api/feedback", async (req: Request, res: Response) => {
    try {
      const { restaurant, location, notes } = req.body;
      console.log(`[FEEDBACK] Restaurant: ${restaurant} | Location: ${location} | Notes: ${notes}`);
      res.json({ success: true });
    } catch (error) {
      console.error("POST /api/feedback error:", error);
      res.status(500).json({ error: "Failed to submit feedback" });
    }
  });

  app.post("/api/chat", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(z.object({ messages: z.array(messageSchema).min(1).max(20) }), req.body, res);
      if (!input) return;
      const { messages } = input;
      const latestUserMessage = [...messages].reverse().find((message) => message.role === "user")?.content ?? "";

      if (isUrgentHealthQuestion(latestUserMessage)) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        const event = chatEventSchema.parse({ content: URGENT_HEALTH_RESPONSE, urgent: true });
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      if (isMedicalTreatmentQuestion(latestUserMessage)) {
        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("X-Accel-Buffering", "no");
        res.flushHeaders();
        const event = chatEventSchema.parse({ content: MEDICAL_TREATMENT_RESPONSE });
        res.write(`data: ${JSON.stringify(event)}\n\n`);
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      if (!(await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT))) return;
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are a friendly educational nutrition assistant for DiabEats, helping people compare restaurant meals. Use non-diagnostic language: explain general food patterns, use “may” or “can vary,” and never claim certainty about glucose outcomes. Never provide insulin doses, medication adjustments, diagnosis, or treatment advice. For severe symptoms or suspected urgent low/high glucose, tell the user to seek urgent local care. Cite only the details the user gives; do not invent nutrition facts. Keep responses concise and practical.",
          },
          ...messages.map((message) => ({
            role: "user" as const,
            content: message.role === "assistant"
              ? `Untrusted prior assistant transcript for context only: ${message.content}`
              : message.content,
          })),
        ],
        stream: true,
        max_tokens: 1024,
      });

      let fullContent = "";
      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || "";
        fullContent += content;
      }
      const boundedContent = fullContent.trim().slice(0, 3200);
      const safeContent = containsUnsafeMedicalAdvice(boundedContent) ? MEDICAL_TREATMENT_RESPONSE : boundedContent;
      const finalContent = `${safeContent}\n\n${AI_DISCLAIMER}`.trim();
      const event = chatEventSchema.parse({ content: finalContent });
      res.write(`data: ${JSON.stringify(event)}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    } catch (error) {
      console.error("POST /api/chat error:", error);
      if (res.headersSent) {
        res.write(`data: ${JSON.stringify({ error: "Failed to get response" })}\n\n`);
        res.end();
      } else {
        res.status(500).json({ error: "Failed to get response" });
      }
    }
  });

  app.post("/api/scan-menu", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(
        z.object({
          image: z.string().min(100).max(8_000_000).regex(/^[A-Za-z0-9+/=\s]+$/, "Image must be base64 encoded"),
        }),
        req.body,
        res,
      );
      if (!input) return;
      if (!(await consumeAiQuota(req, res, "scan", SCAN_LIMIT))) return;
      const { image } = input;

      const response = await openai.chat.completions.create({
        model: "gpt-4o",
        max_tokens: 2000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:image/jpeg;base64,${image}`, detail: "high" },
              },
              {
                type: "text",
                 text: `Read this restaurant menu photo and provide educational, non-diagnostic guidance for items that are clearly legible. Do not call any item safe, diagnose, or predict a person's blood glucose. Nutrition and portions are uncertain unless printed and legible.

Return ONLY valid JSON with this exact structure (no markdown, no code blocks):
{
  "restaurantType": "type of cuisine or restaurant",
  "summary": "2-3 sentences explaining that this is an image-based estimate and what was clearly legible",
  "items": [
    {
      "name": "exact item name from menu",
      "description": "brief description of the dish (1 sentence)",
      "diabeticScore": "good",
      "carbRange": "estimated carb range e.g. 10-20g carbs",
      "quickTip": "one practical tip for a diabetic ordering this"
    }
  ]
}

Scoring rules:
- "good": a comparatively lower-carbohydrate pattern based on visible words only
- "caution": a moderate or uncertain carbohydrate pattern
- "avoid": a comparatively higher-carbohydrate or sugary pattern

Only include items you can clearly read. If image quality is poor, return empty items array with an explanatory summary.`,
              },
            ],
          },
        ],
      });

      const raw = response.choices[0]?.message?.content ?? "{}";
      const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      const model = safeParseAiJson(
        z.object({
          restaurantType: z.string().trim().min(1).max(100),
          summary: z.string().trim().min(1).max(600),
          items: z.array(z.object({
            name: z.string().trim().min(1).max(160),
            description: z.string().trim().min(1).max(360),
            diabeticScore: z.enum(["good", "caution", "avoid"]),
            carbRange: z.string().trim().min(1).max(80),
            quickTip: z.string().trim().min(1).max(220),
          }).strict()).max(40),
        }).strict(),
        cleaned,
      );
      assertSafeEducationalText(model);
      const parsed = scanResultSchema.parse({
        ...model,
        informationUsed: ["A user-provided photo of a restaurant menu", "Only text the model reported as clearly legible"],
        limitations: "Image quality, menu updates, ingredients, portions, and preparation can make this incomplete or inaccurate.",
        verification: AI_VERIFICATION,
        evidence: aiResponseEvidence("User-provided menu image + AI text reading", "No restaurant nutrition database was checked; any carbohydrate ranges are estimates from the image.", false),
      });

      console.log(`Menu scan: ${parsed.items?.length ?? 0} items identified (${parsed.restaurantType})`);
      res.json(parsed);
    } catch (err: any) {
      console.error("POST /api/scan-menu error:", err);
      if (err instanceof SyntaxError) {
        return res.status(500).json({ error: "Could not parse menu analysis. Please try again." });
      }
      res.status(500).json({ error: "Menu analysis failed. Please try again." });
    }
  });

  app.get("/api/confidence/:itemId", async (req: Request, res: Response) => {
    try {
      const rawItemId = req.params.itemId;
      const itemId = Array.isArray(rawItemId) ? rawItemId[0] : rawItemId;
      if (!itemId) {
        return res.status(400).json({ error: "Item ID is required" });
      }
      const rows = await db
        .select()
        .from(userEvents)
        .where(
          and(
            eq(userEvents.itemId, itemId),
            inArray(userEvents.event, ["meal_detail_viewed", "order_guide_opened"])
          )
        );
      // order_guide_opened is a stronger signal — count it double
      const count = rows.reduce((acc, r) => acc + (r.event === "order_guide_opened" ? 2 : 1), 0);
      res.json({ count, itemId });
    } catch (err) {
      console.error("GET /api/confidence error:", err);
      res.status(500).json({ error: "Failed to get confidence" });
    }
  });

  app.post("/api/events", requireSession, async (req: Request, res: Response) => {
    try {
      const { event, restaurantId, restaurantName, itemId, itemName, metadata } = req.body;
      if (!event) return res.status(400).json({ error: "Missing event" });
      await db.insert(userEvents).values({
        event,
        restaurantId: restaurantId ?? null,
        restaurantName: restaurantName ?? null,
        itemId: itemId ?? null,
        itemName: itemName ?? null,
        metadata: metadata ? JSON.stringify(metadata) : null,
      });
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("POST /api/events error:", err);
      res.status(500).json({ error: "Failed to log event" });
    }
  });

  app.get("/api/admin/stats", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const events = await db.select().from(userEvents).orderBy(desc(userEvents.createdAt)).limit(1000);

      const byType: Record<string, number> = {};
      const byRestaurant: Record<string, number> = {};
      const byItem: Record<string, { name: string; restaurantName: string; count: number }> = {};

      for (const e of events) {
        byType[e.event] = (byType[e.event] ?? 0) + 1;
        if (e.restaurantName) {
          byRestaurant[e.restaurantName] = (byRestaurant[e.restaurantName] ?? 0) + 1;
        }
        if (e.itemId && e.itemName) {
          if (!byItem[e.itemId]) byItem[e.itemId] = { name: e.itemName, restaurantName: e.restaurantName ?? "", count: 0 };
          byItem[e.itemId].count++;
        }
      }

      const topRestaurants = Object.entries(byRestaurant)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([name, count]) => ({ name, count }));

      const topItems = Object.values(byItem)
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      res.json({
        total: events.length,
        byType,
        topRestaurants,
        topItems,
        recent: events.slice(0, 200).map((e) => ({
          id: e.id,
          event: e.event,
          restaurantName: e.restaurantName,
          itemName: e.itemName,
          createdAt: e.createdAt,
        })),
      });
    } catch (err) {
      console.error("GET /api/admin/stats error:", err);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  app.post("/api/track-click", requireSession, async (req: Request, res: Response) => {
    try {
      const { restaurantId, restaurantName, platform, orderUrl, cartItems, cartTotal } = req.body;
      if (!restaurantId || !platform || !orderUrl) {
        return res.status(400).json({ error: "Missing required fields" });
      }
      await db.insert(referralClicks).values({
        restaurantId,
        restaurantName: restaurantName || "",
        platform,
        orderUrl,
        cartItems: cartItems || [],
        cartTotal: cartTotal || 0,
      });
      console.log(`Referral click: ${restaurantName} via ${platform} — cart total $${cartTotal?.toFixed(2) ?? "0.00"}`);
      res.status(201).json({ ok: true });
    } catch (err) {
      console.error("POST /api/track-click error:", err);
      res.status(500).json({ error: "Failed to record click" });
    }
  });

  app.post("/api/best-meal", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    try {
      const input = validate(
        z.object({
          restaurantName: z.string().trim().min(1).max(160),
          cuisineType: z.string().trim().max(80).default(""),
          menuItems: z
            .array(
              z.object({
                name: z.string().trim().min(1).max(160),
                description: z.string().trim().max(800).default(""),
                diabeticScore: z.string().trim().max(30).default(""),
                carbRange: z.string().trim().max(100).default(""),
              }),
            )
            .min(1)
            .max(80),
          dietGoal: z.string().trim().max(120).default(""),
          dietPreference: z.string().trim().max(120).default(""),
        }),
        req.body,
        res,
      );
      if (!input) return;
      if (!(await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT, true))) return;
      const { restaurantName, cuisineType, menuItems: items } = input;

      const candidates = items.filter((m: any) => m.diabeticScore !== "avoid");
      const formattedItems = candidates
        .map((m: any) => `- ${m.name} (${String(m.diabeticScore).toUpperCase()}, ~${m.carbRange} carbs): ${m.description || ""}`)
        .join("\n");

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content: "You are an educational nutrition assistant. Help people compare the provided restaurant menu items without medical claims, diagnosis, or individual glucose predictions. Use cautious language and base the recommendation only on supplied menu details.",
          },
          {
            role: "user",
            content: `Compare these menu options from ${restaurantName} (${cuisineType || "restaurant"}). Use only the supplied menu details and do not infer information about a person.

Menu options:
${formattedItems}

Recommend the BEST single meal. Respond ONLY in valid JSON:
{"recommendedMeal":"exact meal name from the options","reason":"1–2 sentences why this is a reasonable option based on supplied details","bloodSugarImpact":"good or caution","estimatedCarbs":"the supplied carb range, e.g. 25–30g","tips":["tip 1","tip 2"],"modification":"optional modification or null"}`,
          },
        ],
        response_format: { type: "json_object" },
        max_tokens: 400,
      });

      const raw = completion.choices[0]?.message?.content || "{}";
      const model = safeParseAiJson(
        z.object({
          recommendedMeal: z.string().trim().min(1).max(160),
          reason: z.string().trim().min(1).max(420),
          bloodSugarImpact: z.enum(["good", "caution"]),
          estimatedCarbs: z.string().trim().min(1).max(80),
          tips: z.array(z.string().trim().min(1).max(180)).min(1).max(3),
          modification: z.string().trim().min(1).max(220).nullable(),
        }).strict(),
        raw,
      );
      assertSafeEducationalText(model);
      const knownCandidate = candidates.some((candidate) => candidate.name === model.recommendedMeal);
      if (!knownCandidate) throw new Error("AI recommended an item not on the supplied menu");
      res.json(bestMealResultSchema.parse({
        ...model,
        confidence: "medium",
        informationUsed: candidates.map((candidate) => `${candidate.name}: ${candidate.carbRange || "carbs not listed"}`).slice(0, 8),
        limitations: "This compares the provided menu data only. Ingredients, portions, and individual response can vary.",
        verification: AI_VERIFICATION,
        evidence: aiResponseEvidence("DiabEats restaurant menu data + AI comparison", "Uses the listed menu entries only; confirm current nutrition and availability with the restaurant.", false),
      }));
    } catch (err) {
      console.error("POST /api/best-meal error:", err);
      res.status(500).json({ error: "Failed to generate recommendation" });
    }
  });

  app.get("/api/referrals", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const clicks = await db
        .select()
        .from(referralClicks)
        .orderBy(referralClicks.clickedAt);

      const byRestaurant: Record<string, { name: string; totalClicks: number; totalCartValue: number; platforms: Record<string, number> }> = {};
      for (const click of clicks) {
        if (!byRestaurant[click.restaurantId]) {
          byRestaurant[click.restaurantId] = { name: click.restaurantName, totalClicks: 0, totalCartValue: 0, platforms: {} };
        }
        byRestaurant[click.restaurantId].totalClicks++;
        byRestaurant[click.restaurantId].totalCartValue += click.cartTotal ?? 0;
        byRestaurant[click.restaurantId].platforms[click.platform] = (byRestaurant[click.restaurantId].platforms[click.platform] || 0) + 1;
      }

      res.json({
        totalClicks: clicks.length,
        totalCartValue: clicks.reduce((s, c) => s + (c.cartTotal ?? 0), 0),
        byRestaurant: Object.entries(byRestaurant)
          .map(([id, data]) => ({ restaurantId: id, ...data, avgCartValue: data.totalCartValue / data.totalClicks }))
          .sort((a, b) => b.totalClicks - a.totalClicks),
        recentClicks: clicks.slice(-50).reverse().map((c) => ({
          id: c.id,
          restaurantName: c.restaurantName,
          platform: c.platform,
          cartTotal: c.cartTotal,
          itemCount: (c.cartItems as any[])?.reduce((s: number, i: any) => s + i.quantity, 0) ?? 0,
          clickedAt: c.clickedAt,
        })),
      });
    } catch (err) {
      console.error("GET /api/referrals error:", err);
      res.status(500).json({ error: "Failed to fetch referrals" });
    }
  });

  app.post("/api/user-feedback", requireSession, async (req: Request, res: Response) => {
    const { message } = req.body;
    if (!message?.trim()) {
      return res.status(400).json({ error: "message required" });
    }
    try {
      await db.insert(userFeedback).values({ message: message.trim() });
    } catch (err) {
      console.error("Failed to save user feedback:", err);
    }
    res.json({ ok: true });
  });

  app.get("/api/admin/feedback", requireAdmin, async (_req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(userFeedback)
        .orderBy(desc(userFeedback.createdAt));
      res.json({ total: rows.length, feedback: rows });
    } catch (err) {
      console.error("GET /api/admin/feedback error:", err);
      res.status(500).json({ error: "Failed to fetch feedback" });
    }
  });

  app.post("/api/ai-menu", requireSession, aiRateLimit, async (req: Request, res: Response) => {
    const input = validate(z.object({ restaurantName: z.string().trim().min(1).max(160) }), req.body, res);
    if (!input) return;
    if (!(await consumeAiQuota(req, res, "ai", AI_QUESTION_LIMIT, true))) return;
    const { restaurantName } = input;
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          {
            role: "system",
            content:
              "You are an educational nutrition assistant. Do not claim clinical credentials or verified restaurant-menu knowledge. Do not invent exact menu data, call food safe, predict glucose, diagnose, or give treatment advice. Provide clearly labeled, cautious estimates only. Return valid JSON only.",
          },
          {
            role: "user",
            content: `Create an illustrative, non-verified menu guide for "${restaurantName}" with cautious food-pattern labels. Do not claim these are its actual current menu items or official nutrition values.

For each item provide:
- name: a plausible item name; do not present it as exact or current
- category: menu section (e.g., "Appetizers", "Salads", "Burgers", "Sides", "Desserts", "Drinks")
- rating: "good" (comparatively lower-carbohydrate pattern), "caution" (moderate or uncertain carbohydrate pattern), or "avoid" (comparatively higher-carbohydrate or sugary pattern)
- reason: one clear sentence explaining why this rating
- carbs: broad estimated carbs in grams (number only)
- calories: broad estimated calories (number only)
- protein: broad estimated protein in grams (number only)
- tip: specific modification or ordering tip for people with diabetes (e.g., "Ask for no bun", "Request dressing on side", "Skip the sauce")

Return JSON: { "items": [{ "name": string, "category": string, "rating": "good"|"caution"|"avoid", "reason": string, "carbs": number, "calories": number, "protein": number, "tip": string }] }

Include 10-15 illustrative items covering common menu sections. Use cautious reasons that say estimates may vary.`,
          },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      });

      const content = completion.choices[0].message.content;
      const model = safeParseAiJson(
        z.object({
          items: z.array(z.object({
            name: z.string().trim().min(1).max(160),
            category: z.string().trim().min(1).max(80),
            rating: z.enum(["good", "caution", "avoid"]),
            reason: z.string().trim().min(1).max(300),
            carbs: z.number().finite().min(0).max(300),
            calories: z.number().finite().min(0).max(3000),
            protein: z.number().finite().min(0).max(300),
            tip: z.string().trim().min(1).max(220),
          }).strict()).max(25),
        }).strict(),
        content || "{}",
      );
      assertSafeEducationalText(model);
      res.json(aiMenuResultSchema.parse({
        restaurantName,
        items: model.items,
        informationUsed: [`Restaurant name entered by the user: ${restaurantName}`, "General food-pattern knowledge; no official menu or nutrition source was retrieved"],
        limitations: "This is an illustrative AI guide, not a current restaurant menu. Items, recipes, portions, and nutrition can differ or be unavailable.",
        verification: AI_VERIFICATION,
        evidence: aiResponseEvidence("AI-generated illustrative menu guide", "No official restaurant menu, nutrition label, or live source was used.", false),
      }));
    } catch (err) {
      console.error("POST /api/ai-menu error:", err);
      res.status(500).json({ error: "Failed to generate menu" });
    }
  });

  // -------------------------------------------------------------------------
  // BioTrace: food intelligence (Open Food Facts, no AI / no OpenAI quota)
  // -------------------------------------------------------------------------

  function handleProviderError(err: unknown, res: Response, fallback: string): void {
    if (err instanceof ProviderError) {
      res.status(err.status).json({ error: err.message, code: err.kind });
      return;
    }
    console.error(fallback, err);
    res.status(500).json({ error: fallback });
  }

  /** Persists (best-effort) a normalized product into the shared cache. */
  async function cacheProduct(product: NormalizedProduct): Promise<void> {
    if (!product.barcode) return;
    try {
      await db
        .insert(biotraceProducts)
        .values({ barcode: product.barcode, name: product.name, brand: product.brand ?? null, data: product })
        .onConflictDoUpdate({
          target: biotraceProducts.barcode,
          set: { name: product.name, brand: product.brand ?? null, data: product, fetchedAt: new Date() },
        });
    } catch (error) {
      console.error("BioTrace product cache write failed:", error);
    }
  }

  const biotraceRatedProduct = (product: NormalizedProduct) => ({
    product,
    rating: computeBioTraceRating(product),
  });

  // Lookup a product by barcode.
  app.get(
    "/api/biotrace/product/:barcode",
    requireSession,
    productLookupRateLimit,
    async (req: Request, res: Response) => {
      const parsed = barcodeSchema.safeParse(req.params.barcode);
      if (!parsed.success) {
        return res.status(400).json({ error: "Barcode must be 8 to 14 digits.", code: "invalid_barcode" });
      }
      try {
        const product = await lookupByBarcode(parsed.data);
        await cacheProduct(product);
        res.json(biotraceRatedProduct(product));
      } catch (err) {
        handleProviderError(err, res, "Failed to look up product.");
      }
    },
  );

  // Search products by name.
  app.get(
    "/api/biotrace/search",
    requireSession,
    productLookupRateLimit,
    async (req: Request, res: Response) => {
      const input = validate(
        z.object({
          q: z.string().trim().min(1).max(200),
          page: z.coerce.number().int().min(1).max(20).optional().default(1),
          pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
        }),
        req.query,
        res,
      );
      if (!input) return;
      try {
        const result = await searchByName(input.q, input.page, input.pageSize);
        res.json(result);
      } catch (err) {
        handleProviderError(err, res, "Product search failed.");
      }
    },
  );

  // Deterministic ranked alternatives for a barcode.
  app.get(
    "/api/biotrace/alternatives/:barcode",
    requireSession,
    productLookupRateLimit,
    async (req: Request, res: Response) => {
      const parsed = barcodeSchema.safeParse(req.params.barcode);
      if (!parsed.success) {
        return res.status(400).json({ error: "Barcode must be 8 to 14 digits.", code: "invalid_barcode" });
      }
      const limitInput = validate(
        z.object({ limit: z.coerce.number().int().min(1).max(10).optional().default(5) }),
        req.query,
        res,
      );
      if (!limitInput) return;
      try {
        const product = await lookupByBarcode(parsed.data);
        await cacheProduct(product);
        const alternatives = await findAlternatives(product, limitInput.limit);
        res.json({
          source: biotraceRatedProduct(product),
          alternatives,
        });
      } catch (err) {
        handleProviderError(err, res, "Failed to find alternatives.");
      }
    },
  );

  // Record a scan / lookup into owner-scoped history.
  const biotraceHistoryItemSchema = z.object({
    barcode: barcodeSchema,
    source: z.enum(["barcode", "search", "manual"]).optional().default("barcode"),
    note: z.string().trim().max(500).nullable().optional().default(null),
  });

  async function providerBackedHistoryItem(input: { barcode: string }) {
    const product = await lookupByBarcode(input.barcode);
    await cacheProduct(product);
    const rating = computeBioTraceRating(product);
    return { product, rating };
  }

  app.post("/api/biotrace/scans", requireSession, productLookupRateLimit, async (req: Request, res: Response) => {
    const input = validate(biotraceHistoryItemSchema, req.body, res);
    if (!input) return;
    try {
      const { product, rating } = await providerBackedHistoryItem(input);
      const [row] = await db
        .insert(biotraceScans)
        .values({
          sessionId: req.sessionIdentity!.id,
          barcode: product.barcode,
          productName: product.name,
          brand: product.brand,
          ratingLabel: rating.label,
          ratingScore: rating.score,
          product,
          rating,
          source: input.source ?? "barcode",
        })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      handleProviderError(err, res, "Failed to save scan.");
    }
  });

  app.get("/api/biotrace/scans", requireSession, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(biotraceScans)
        .where(eq(biotraceScans.sessionId, req.sessionIdentity!.id))
        .orderBy(desc(biotraceScans.id))
        .limit(200);
      res.json(rows);
    } catch (err) {
      console.error("GET /api/biotrace/scans error:", err);
      res.status(500).json({ error: "Failed to load scan history." });
    }
  });

  app.delete("/api/biotrace/scans/:id", requireSession, async (req: Request, res: Response) => {
    const idInput = validate(z.object({ id: z.coerce.number().int().positive() }), req.params, res);
    if (!idInput) return;
    try {
      const deleted = await db
        .delete(biotraceScans)
        .where(and(eq(biotraceScans.id, idInput.id), eq(biotraceScans.sessionId, req.sessionIdentity!.id)))
        .returning({ id: biotraceScans.id });
      if (deleted.length === 0) {
        return res.status(404).json({ error: "Scan not found." });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/biotrace/scans/:id error:", err);
      res.status(500).json({ error: "Failed to delete scan." });
    }
  });

  app.delete("/api/biotrace/scans", requireSession, async (req: Request, res: Response) => {
    try {
      await db.delete(biotraceScans).where(eq(biotraceScans.sessionId, req.sessionIdentity!.id));
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/biotrace/scans error:", err);
      res.status(500).json({ error: "Failed to clear history." });
    }
  });

  // Saved foods (owner-scoped) --------------------------------------------------
  app.get("/api/biotrace/saved", requireSession, async (req: Request, res: Response) => {
    try {
      const rows = await db
        .select()
        .from(biotraceSavedFoods)
        .where(eq(biotraceSavedFoods.sessionId, req.sessionIdentity!.id))
        .orderBy(desc(biotraceSavedFoods.id))
        .limit(200);
      res.json(rows);
    } catch (err) {
      console.error("GET /api/biotrace/saved error:", err);
      res.status(500).json({ error: "Failed to load saved foods." });
    }
  });

  app.post("/api/biotrace/saved", requireSession, productLookupRateLimit, async (req: Request, res: Response) => {
    const input = validate(biotraceHistoryItemSchema, req.body, res);
    if (!input) return;
    try {
      const { product, rating } = await providerBackedHistoryItem(input);
      const [row] = await db
        .insert(biotraceSavedFoods)
        .values({
          sessionId: req.sessionIdentity!.id,
          barcode: product.barcode,
          productName: product.name,
          brand: product.brand,
          ratingLabel: rating.label,
          note: input.note ?? null,
          product,
          rating,
        })
        .onConflictDoUpdate({
          target: [biotraceSavedFoods.sessionId, biotraceSavedFoods.barcode],
          set: {
            productName: product.name,
            brand: product.brand,
            ratingLabel: rating.label,
            note: input.note ?? null,
            product,
            rating,
            updatedAt: new Date(),
          },
        })
        .returning();
      res.status(201).json(row);
    } catch (err) {
      handleProviderError(err, res, "Failed to save food.");
    }
  });

  app.patch("/api/biotrace/saved/:id", requireSession, async (req: Request, res: Response) => {
    const idInput = validate(z.object({ id: z.coerce.number().int().positive() }), req.params, res);
    if (!idInput) return;
    const input = validate(
      z.object({ note: z.string().trim().max(500).nullable() }),
      req.body,
      res,
    );
    if (!input) return;
    try {
      const updated = await db
        .update(biotraceSavedFoods)
        .set({ note: input.note, updatedAt: new Date() })
        .where(
          and(eq(biotraceSavedFoods.id, idInput.id), eq(biotraceSavedFoods.sessionId, req.sessionIdentity!.id)),
        )
        .returning();
      if (updated.length === 0) {
        return res.status(404).json({ error: "Saved food not found." });
      }
      res.json(updated[0]);
    } catch (err) {
      console.error("PATCH /api/biotrace/saved/:id error:", err);
      res.status(500).json({ error: "Failed to update saved food." });
    }
  });

  app.delete("/api/biotrace/saved/:id", requireSession, async (req: Request, res: Response) => {
    const idInput = validate(z.object({ id: z.coerce.number().int().positive() }), req.params, res);
    if (!idInput) return;
    try {
      const deleted = await db
        .delete(biotraceSavedFoods)
        .where(
          and(eq(biotraceSavedFoods.id, idInput.id), eq(biotraceSavedFoods.sessionId, req.sessionIdentity!.id)),
        )
        .returning({ id: biotraceSavedFoods.id });
      if (deleted.length === 0) {
        return res.status(404).json({ error: "Saved food not found." });
      }
      res.json({ ok: true });
    } catch (err) {
      console.error("DELETE /api/biotrace/saved/:id error:", err);
      res.status(500).json({ error: "Failed to delete saved food." });
    }
  });

  // Product correction reporting ------------------------------------------------
  app.post("/api/biotrace/corrections", requireSession, async (req: Request, res: Response) => {
    const input = validate(
      z.object({
        barcode: barcodeSchema.nullable().optional().default(null),
        productName: z.string().trim().min(1).max(200),
        field: z.string().trim().min(1).max(60),
        reportedValue: z.string().trim().min(1).max(500),
        details: z.string().trim().max(1000).nullable().optional().default(null),
      }),
      req.body,
      res,
    );
    if (!input) return;
    try {
      const [row] = await db
        .insert(biotraceCorrections)
        .values({
          sessionId: req.sessionIdentity!.id,
          barcode: input.barcode ?? null,
          productName: input.productName,
          field: input.field,
          reportedValue: input.reportedValue,
          details: input.details ?? null,
        })
        .returning({ id: biotraceCorrections.id, status: biotraceCorrections.status });
      res.status(201).json({ ok: true, id: row?.id, status: row?.status ?? "open" });
    } catch (err) {
      console.error("POST /api/biotrace/corrections error:", err);
      res.status(500).json({ error: "Failed to submit correction." });
    }
  });

  const httpServer = createServer(app);
  return httpServer;
}
