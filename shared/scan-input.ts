export type ScanInput =
  | { kind: "barcode"; value: string }
  | { kind: "product-query"; value: string }
  | { kind: "url"; value: string }
  | { kind: "test-menu"; value: string }
  | { kind: "unsupported"; value: string };

export function parseScanInput(raw: string): ScanInput {
  const value = raw.trim();
  if (/^\d{8,14}$/.test(value)) return { kind: "barcode", value };

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (parsed.schema === "diabeats.test.menu.v1" && parsed.test_only === true) {
      return { kind: "test-menu", value };
    }
    const embedded = typeof parsed.barcode === "string" ? parsed.barcode.replace(/\D/g, "") : "";
    if (/^\d{8,14}$/.test(embedded)) return { kind: "barcode", value: embedded };
    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    if (name) return { kind: "product-query", value: name.slice(0, 200) };
    return { kind: "unsupported", value };
  } catch {}

  try {
    const url = new URL(value);
    const match = url.pathname.match(/(?:product|products?)\/(\d{8,14})(?:\/|$)/i);
    if (match?.[1]) return { kind: "barcode", value: match[1] };
    return ["http:", "https:"].includes(url.protocol)
      ? { kind: "url", value: url.toString() }
      : { kind: "unsupported", value };
  } catch {}

  if (/^\d+$/.test(value)) return { kind: "unsupported", value };
  return value.length >= 2
    ? { kind: "product-query", value: value.slice(0, 200) }
    : { kind: "unsupported", value };
}
