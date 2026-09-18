import assert from "node:assert/strict";
import test from "node:test";

import {
  BIOTRACE_DUPLICATE_WINDOW_MS as LOCAL_WINDOW_MS,
  canonicalBioTraceBarcode,
  dedupeLocalBioTraceScans,
  isDuplicateBioTraceScan,
  type HistoryRecord,
} from "../lib/biotrace-history-logic";
import {
  BIOTRACE_DUPLICATE_WINDOW_MS as SERVER_WINDOW_MS,
  isBioTraceDuplicateWithinWindow,
} from "../server/routes";

const record = (barcode: string, scannedAt: string, localId: string): HistoryRecord =>
  ({ barcode, scannedAt, localId });

test("local history treats UPC-A and zero-padded GTIN-14 as one barcode", () => {
  assert.equal(canonicalBioTraceBarcode("00012345678905"), "012345678905");
  assert.equal(
    isDuplicateBioTraceScan(
      "012345678905",
      "2026-01-01T12:00:00.000Z",
      "00012345678905",
      "2026-01-01T12:00:30.000Z",
    ),
    true,
  );
});

test("local history suppresses duplicates through the inclusive 30-second boundary", () => {
  const first = "2026-01-01T12:00:00.000Z";
  const boundary = new Date(new Date(first).getTime() + LOCAL_WINDOW_MS).toISOString();
  const outside = new Date(new Date(first).getTime() + LOCAL_WINDOW_MS + 1).toISOString();
  assert.equal(isDuplicateBioTraceScan("012345678905", first, "012345678905", boundary), true);
  assert.equal(isDuplicateBioTraceScan("012345678905", first, "012345678905", outside), false);
});

test("local history migration removes only repeated products inside the window", () => {
  const base = new Date("2026-01-01T12:00:00.000Z").getTime();
  const records = dedupeLocalBioTraceScans([
    record("012345678905", new Date(base).toISOString(), "old"),
    record("00012345678905", new Date(base + 10_000).toISOString(), "duplicate"),
    record("012345678905", new Date(base + LOCAL_WINDOW_MS + 1).toISOString(), "outside-window"),
    record("099999999999", new Date(base + 15_000).toISOString(), "different"),
  ]);
  assert.deepEqual(records.map((item) => item.localId), ["outside-window", "different", "old"]);
  assert.deepEqual(records.map((item) => item.barcode), ["012345678905", "099999999999", "012345678905"]);
});

test("server duplicate helper is owner-independent and preserves distinct products", () => {
  const first = new Date("2026-01-01T12:00:00.000Z");
  const boundary = new Date(first.getTime() + SERVER_WINDOW_MS);
  const outside = new Date(first.getTime() + SERVER_WINDOW_MS + 1);
  assert.equal(isBioTraceDuplicateWithinWindow("012345678905", first, "00012345678905", boundary), true);
  assert.equal(isBioTraceDuplicateWithinWindow("012345678905", first, "012345678905", outside), false);
  assert.equal(isBioTraceDuplicateWithinWindow("099999999999", first, "012345678905", boundary), false);
  assert.equal(isBioTraceDuplicateWithinWindow(null, first, "012345678905", boundary), false);
});