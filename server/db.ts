import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
});

export const db = drizzle(pool, { schema });

export async function ensureSecuritySchema(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      revenue_cat_user_id TEXT NOT NULL UNIQUE,
      usage_key TEXT NOT NULL,
      is_premium BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ai_usage (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      usage_key TEXT NOT NULL,
      usage_date TEXT NOT NULL,
      feature TEXT NOT NULL,
      count INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT ai_usage_session_day_feature_idx UNIQUE (session_id, usage_date, feature),
      CONSTRAINT ai_usage_usage_day_feature_idx UNIQUE (usage_key, usage_date, feature)
    );

    ALTER TABLE orders ADD COLUMN IF NOT EXISTS session_id TEXT;
    ALTER TABLE app_sessions ADD COLUMN IF NOT EXISTS usage_key TEXT;
    UPDATE app_sessions SET usage_key = id WHERE usage_key IS NULL;
    ALTER TABLE app_sessions ALTER COLUMN usage_key SET NOT NULL;
    ALTER TABLE ai_usage ADD COLUMN IF NOT EXISTS usage_key TEXT;
    UPDATE ai_usage SET usage_key = session_id WHERE usage_key IS NULL;
    ALTER TABLE ai_usage ALTER COLUMN usage_key SET NOT NULL;
    CREATE INDEX IF NOT EXISTS orders_session_id_idx ON orders(session_id);
    CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_usage_day_feature_idx
      ON ai_usage(usage_key, usage_date, feature);

    -- BioTrace: cached normalized products (never stores label images)
    CREATE TABLE IF NOT EXISTS biotrace_products (
      barcode TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      brand TEXT,
      data JSONB NOT NULL,
      fetched_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    -- BioTrace: owner-scoped scan / lookup history
    CREATE TABLE IF NOT EXISTS biotrace_scans (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      barcode TEXT,
      product_name TEXT NOT NULL,
      brand TEXT,
      rating_label TEXT NOT NULL,
      rating_score REAL,
      product JSONB NOT NULL,
      rating JSONB NOT NULL,
      source TEXT NOT NULL DEFAULT 'barcode',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS biotrace_scans_session_created_idx
      ON biotrace_scans(session_id, id DESC);

    -- BioTrace: owner-scoped saved foods
    CREATE TABLE IF NOT EXISTS biotrace_saved_foods (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      barcode TEXT,
      product_name TEXT NOT NULL,
      brand TEXT,
      rating_label TEXT NOT NULL,
      note TEXT,
      product JSONB NOT NULL,
      rating JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS biotrace_saved_session_barcode_idx
      ON biotrace_saved_foods(session_id, barcode);

    -- BioTrace: owner-scoped product correction reports
    CREATE TABLE IF NOT EXISTS biotrace_corrections (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL REFERENCES app_sessions(id) ON DELETE CASCADE,
      barcode TEXT,
      product_name TEXT NOT NULL,
      field TEXT NOT NULL,
      reported_value TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
  `);
}
