export const BIOTRACE_DUPLICATE_WINDOW_MS = 30_000;

/** Use one key for UPC-A and its zero-padded GTIN-14 representation. */
export function canonicalBioTraceBarcode(value: string): string {
  const trimmed = value.trim();
  return /^\d{14}$/u.test(trimmed) && trimmed.startsWith("00") ? trimmed.slice(2) : trimmed;
}

export function isDuplicateBioTraceScan(
  existingBarcode: string,
  existingScannedAt: string,
  candidateBarcode: string,
  candidateScannedAt: string,
): boolean {
  if (canonicalBioTraceBarcode(existingBarcode) !== canonicalBioTraceBarcode(candidateBarcode)) return false;
  const elapsed = new Date(candidateScannedAt).getTime() - new Date(existingScannedAt).getTime();
  return elapsed >= 0 && elapsed <= BIOTRACE_DUPLICATE_WINDOW_MS;
}

export type HistoryRecord = {
  barcode: string;
  scannedAt: string;
  [key: string]: unknown;
};

/** Collapse legacy local duplicates while preserving scans outside the window. */
export function dedupeLocalBioTraceScans<T extends HistoryRecord>(records: T[]): T[] {
  const chronological = [...records].sort(
    (left, right) => new Date(left.scannedAt).getTime() - new Date(right.scannedAt).getTime(),
  );
  const retained: T[] = [];
  for (const record of chronological) {
    const previous = [...retained].reverse().find(
      (kept) => canonicalBioTraceBarcode(kept.barcode) === canonicalBioTraceBarcode(record.barcode),
    );
    if (!previous || !isDuplicateBioTraceScan(previous.barcode, previous.scannedAt, record.barcode, record.scannedAt)) {
      retained.push({ ...record, barcode: canonicalBioTraceBarcode(record.barcode) });
    }
  }
  return retained.reverse();
}