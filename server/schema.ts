import {
  pgTable,
  text,
  real,
  integer,
  jsonb,
  timestamp,
  serial,
  boolean,
  uniqueIndex,
} from "drizzle-orm/pg-core";

export const restaurants = pgTable("restaurants", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  cuisine: text("cuisine").notNull(),
  address: text("address").notNull(),
  distance: text("distance").notNull(),
  rating: real("rating").notNull(),
  reviewCount: integer("review_count").notNull(),
  priceLevel: text("price_level").notNull(),
  phone: text("phone").notNull(),
  lat: real("lat").notNull(),
  lng: real("lng").notNull(),
  tags: jsonb("tags").$type<string[]>().notNull(),
  orderUrl: text("order_url"),
});

export const menuItems = pgTable("menu_items", {
  id: text("id").primaryKey(),
  restaurantId: text("restaurant_id")
    .notNull()
    .references(() => restaurants.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description").notNull(),
  category: text("category").notNull(),
  price: text("price").notNull(),
  diabeticScore: text("diabetic_score").notNull(),
  carbRange: text("carb_range").notNull(),
  nutrients: jsonb("nutrients").$type<{ label: string; value: string }[]>().notNull(),
  quickTip: text("quick_tip").notNull(),
});

export const orders = pgTable("orders", {
  id: text("id").primaryKey(),
  sessionId: text("session_id"),
  restaurantId: text("restaurant_id").notNull(),
  restaurantName: text("restaurant_name").notNull(),
  deliveryName: text("delivery_name").notNull(),
  deliveryAddress: text("delivery_address").notNull(),
  deliveryPhone: text("delivery_phone").notNull().default(""),
  notes: text("notes").notNull().default(""),
  total: text("total").notNull(),
  status: text("status").notNull().default("placed"),
  orderType: text("order_type").notNull().default("delivery"),
  placedAt: timestamp("placed_at").defaultNow(),
  estimatedMinutes: integer("estimated_minutes").notNull(),
});

export const appSessions = pgTable("app_sessions", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  revenueCatUserId: text("revenue_cat_user_id").notNull().unique(),
  usageKey: text("usage_key").notNull(),
  isPremium: boolean("is_premium").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  expiresAt: timestamp("expires_at").notNull(),
});

export const aiUsage = pgTable(
  "ai_usage",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => appSessions.id, { onDelete: "cascade" }),
    usageKey: text("usage_key").notNull(),
    usageDate: text("usage_date").notNull(),
    feature: text("feature").notNull(),
    count: integer("count").notNull().default(0),
  },
  (table) => [
    uniqueIndex("ai_usage_session_day_feature_idx").on(table.sessionId, table.usageDate, table.feature),
    uniqueIndex("ai_usage_usage_day_feature_idx").on(table.usageKey, table.usageDate, table.feature),
  ],
);

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: text("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull(),
  price: text("price").notNull(),
  diabeticScore: text("diabetic_score").notNull().default("good"),
});

export const referralClicks = pgTable("referral_clicks", {
  id: serial("id").primaryKey(),
  restaurantId: text("restaurant_id").notNull(),
  restaurantName: text("restaurant_name").notNull(),
  platform: text("platform").notNull(),
  orderUrl: text("order_url").notNull(),
  cartItems: jsonb("cart_items").$type<{ name: string; quantity: number; price: string; diabeticScore: string }[]>().notNull().default([]),
  cartTotal: real("cart_total").notNull().default(0),
  clickedAt: timestamp("clicked_at").defaultNow(),
});

export const userEvents = pgTable("user_events", {
  id: serial("id").primaryKey(),
  event: text("event").notNull(),
  restaurantId: text("restaurant_id"),
  restaurantName: text("restaurant_name"),
  itemId: text("item_id"),
  itemName: text("item_name"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const userFeedback = pgTable("user_feedback", {
  id: serial("id").primaryKey(),
  message: text("message").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// ---------------------------------------------------------------------------
// BioTrace tables
// ---------------------------------------------------------------------------

/**
 * Cached normalized products from Open Food Facts. Keyed by barcode. Label
 * images are NEVER persisted — only the normalized JSON payload.
 */
export const biotraceProducts = pgTable("biotrace_products", {
  barcode: text("barcode").primaryKey(),
  name: text("name").notNull(),
  brand: text("brand"),
  data: jsonb("data").notNull(),
  fetchedAt: timestamp("fetched_at").notNull().defaultNow(),
});

/**
 * Owner-scoped scan / lookup history. Stores the resolved product reference and
 * rating snapshot, never a label image.
 */
export const biotraceScans = pgTable(
  "biotrace_scans",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => appSessions.id, { onDelete: "cascade" }),
    barcode: text("barcode"),
    productName: text("product_name").notNull(),
    brand: text("brand"),
    ratingLabel: text("rating_label").notNull(),
    ratingScore: real("rating_score"),
    product: jsonb("product").notNull(),
    rating: jsonb("rating").notNull(),
    source: text("source").notNull().default("barcode"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("biotrace_scans_session_created_idx").on(table.sessionId, table.id)],
);

/**
 * Owner-scoped saved / favorited foods.
 */
export const biotraceSavedFoods = pgTable(
  "biotrace_saved_foods",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => appSessions.id, { onDelete: "cascade" }),
    barcode: text("barcode"),
    productName: text("product_name").notNull(),
    brand: text("brand"),
    ratingLabel: text("rating_label").notNull(),
    note: text("note"),
    product: jsonb("product").notNull(),
    rating: jsonb("rating").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => [uniqueIndex("biotrace_saved_session_barcode_idx").on(table.sessionId, table.barcode)],
);

/**
 * Owner-scoped product correction reports (crowd-sourced data quality).
 */
export const biotraceCorrections = pgTable("biotrace_corrections", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id")
    .notNull()
    .references(() => appSessions.id, { onDelete: "cascade" }),
  barcode: text("barcode"),
  productName: text("product_name").notNull(),
  field: text("field").notNull(),
  reportedValue: text("reported_value").notNull(),
  details: text("details"),
  status: text("status").notNull().default("open"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export type Restaurant = typeof restaurants.$inferSelect;
export type MenuItem = typeof menuItems.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type ReferralClick = typeof referralClicks.$inferSelect;
export type UserEvent = typeof userEvents.$inferSelect;
export type BioTraceProduct = typeof biotraceProducts.$inferSelect;
export type BioTraceScan = typeof biotraceScans.$inferSelect;
export type BioTraceSavedFood = typeof biotraceSavedFoods.$inferSelect;
export type BioTraceCorrection = typeof biotraceCorrections.$inferSelect;
