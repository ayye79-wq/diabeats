import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NormalizedProduct } from "@/shared/biotrace";
import type { BioTraceRating } from "@/shared/biotrace-rating";
import { apiRequest } from "@/lib/query-client";

const HISTORY_KEY = "@diabeats_biotrace_local_history_v1";
const MAX_ITEMS = 200;
export type BioTraceScanSource = "barcode" | "search" | "manual";

export type LocalBioTraceScan = {
  localId: string;
  barcode: string;
  productName: string;
  brand: string | null;
  ratingLabel: string;
  scannedAt: string;
  source: BioTraceScanSource;
  syncState: "pending" | "synced";
  product: NormalizedProduct;
  rating: BioTraceRating;
};

async function read(): Promise<LocalBioTraceScan[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const records = raw ? JSON.parse(raw) : [];
    return Array.isArray(records) ? records : [];
  } catch {
    return [];
  }
}

async function write(records: LocalBioTraceScan[]) {
  await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(records.slice(0, MAX_ITEMS)));
}

export async function recordLocalBioTraceScan(
  result: { product: NormalizedProduct; rating: BioTraceRating },
  source: BioTraceScanSource,
) {
  if (!result.product.barcode) return null;
  const record: LocalBioTraceScan = {
    localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    barcode: result.product.barcode,
    productName: result.product.name,
    brand: result.product.brand ?? null,
    ratingLabel: result.rating.label,
    scannedAt: new Date().toISOString(),
    source,
    syncState: "pending",
    product: result.product,
    rating: result.rating,
  };
  const existing = await read();
  await write([record, ...existing]);
  return record;
}

export async function getPendingLocalBioTraceScans() {
  return (await read()).filter((record) => record.syncState === "pending");
}

export async function removeLocalBioTraceScan(localId: string) {
  await write((await read()).filter((record) => record.localId !== localId));
}

export async function clearLocalBioTraceScans() {
  await AsyncStorage.removeItem(HISTORY_KEY);
}

export async function syncPendingBioTraceScans() {
  const records = await read();
  let changed = false;
  for (const record of records) {
    if (record.syncState !== "pending") continue;
    try {
      await apiRequest("POST", "/api/biotrace/scans", { barcode: record.barcode, source: record.source });
      record.syncState = "synced";
      changed = true;
    } catch {
      break;
    }
  }
  if (changed) await write(records);
}