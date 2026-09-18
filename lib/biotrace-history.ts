import AsyncStorage from "@react-native-async-storage/async-storage";
import type { NormalizedProduct } from "@/shared/biotrace";
import type { BioTraceRating } from "@/shared/biotrace-rating";
import { neutralBioTraceHistorySnapshot } from "@/shared/biotrace-history";
import { apiRequest } from "@/lib/query-client";
import {
  BIOTRACE_DUPLICATE_WINDOW_MS,
  canonicalBioTraceBarcode,
  dedupeLocalBioTraceScans,
  isDuplicateBioTraceScan,
} from "@/lib/biotrace-history-logic";
export { BIOTRACE_DUPLICATE_WINDOW_MS, canonicalBioTraceBarcode, dedupeLocalBioTraceScans, isDuplicateBioTraceScan };

const HISTORY_KEY = "@diabeats_biotrace_local_history_v1";
const MAX_ITEMS = 200;
export type BioTraceScanSource = "barcode" | "search" | "manual" | "qr";

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

let historyMutation: Promise<void> = Promise.resolve();

function withHistoryMutation<T>(operation: () => Promise<T>): Promise<T> {
  const next = historyMutation.then(operation, operation);
  historyMutation = next.then(() => undefined, () => undefined);
  return next;
}

async function read(): Promise<LocalBioTraceScan[]> {
  try {
    const raw = await AsyncStorage.getItem(HISTORY_KEY);
    const records = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(records)) return [];
    const sanitized = records.map((record: LocalBioTraceScan) => {
      const snapshot = neutralBioTraceHistorySnapshot(record);
      return {
        ...record,
        barcode: canonicalBioTraceBarcode(record.barcode),
        ratingLabel: snapshot.rating.label,
        product: snapshot.product,
        rating: snapshot.rating,
      };
    });
    const deduped = dedupeLocalBioTraceScans(sanitized);
    if (raw) {
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(deduped.slice(0, MAX_ITEMS)));
    }
    return deduped.slice(0, MAX_ITEMS);
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
  return withHistoryMutation(async () => {
    const scannedAt = new Date().toISOString();
    const barcode = canonicalBioTraceBarcode(result.product.barcode!);
    const existing = await read();
    const recentDuplicate = existing.find((record) =>
      isDuplicateBioTraceScan(record.barcode, record.scannedAt, barcode, scannedAt),
    );
    if (recentDuplicate) return recentDuplicate;
    const snapshot = neutralBioTraceHistorySnapshot(result);
    const record: LocalBioTraceScan = {
      localId: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      barcode,
      productName: result.product.name,
      brand: result.product.brand ?? null,
      ratingLabel: snapshot.rating.label,
      scannedAt,
      source,
      syncState: "pending",
      product: snapshot.product,
      rating: snapshot.rating,
    };
    await write([record, ...existing]);
    return record;
  });
}

export async function getPendingLocalBioTraceScans() {
  return (await read()).filter((record) => record.syncState === "pending");
}

export async function removeLocalBioTraceScan(localId: string) {
  await withHistoryMutation(async () => write((await read()).filter((record) => record.localId !== localId)));
}

export async function clearLocalBioTraceScans() {
  await withHistoryMutation(() => AsyncStorage.removeItem(HISTORY_KEY));
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