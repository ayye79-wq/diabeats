import { barcodeSchema } from "./biotrace";

const MAX_QR_PAYLOAD_LENGTH = 2_048;
const OPEN_FOOD_FACTS_HOSTS = new Set(["openfoodfacts.org", "world.openfoodfacts.org"]);
const GS1_DIGITAL_LINK_HOST = "id.gs1.org";

export type BioTraceQrResolution =
  | {
      kind: "barcode";
      barcode: string;
      source: "raw-barcode" | "open-food-facts-url" | "gs1-digital-link";
    }
  | {
      kind: "url";
      url: string;
      hostname: string;
    }
  | {
      kind: "content";
      format: "json" | "text";
      content: string;
      summary: string;
    }
  | {
      kind: "unsupported";
      reason: string;
    };

const unsupported = (reason: string): BioTraceQrResolution => ({ kind: "unsupported", reason });

function summarizeJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `Structured JSON array with ${value.length} ${value.length === 1 ? "item" : "items"}.`;
  }
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>);
    const listed = keys.slice(0, 6).join(", ");
    return keys.length
      ? `Structured JSON object with ${keys.length} ${keys.length === 1 ? "field" : "fields"}${listed ? `: ${listed}${keys.length > 6 ? ", …" : ""}` : ""}.`
      : "Structured JSON object with no fields.";
  }
  return `Structured JSON ${value === null ? "null value" : typeof value}.`;
}

/**
 * Resolve QR content without fetching it.
 *
 * Product identifiers can continue through the verified provider lookup. Other
 * payloads are classified for display only; this function never fetches a URL
 * or treats QR-supplied facts as verified product data.
 */
export function resolveBioTraceQrPayload(value: unknown): BioTraceQrResolution {
  if (typeof value !== "string") {
    return unsupported("This scan did not contain readable text.");
  }

  const payload = value.trim();
  if (!payload || payload.length > MAX_QR_PAYLOAD_LENGTH) {
    return unsupported(
      payload
        ? "This QR code contains too much text for BioTrace to display safely."
        : "This QR code is empty.",
    );
  }

  if (barcodeSchema.safeParse(payload).success) {
    return { kind: "barcode", barcode: payload, source: "raw-barcode" };
  }

  let url: URL;
  try {
    url = new URL(payload);
  } catch {
    try {
      const parsed: unknown = JSON.parse(payload);
      return {
        kind: "content",
        format: "json",
        content: JSON.stringify(parsed, null, 2),
        summary: summarizeJson(parsed),
      };
    } catch {
      // Non-JSON text is still useful scan content.
    }
    return {
      kind: "content",
      format: "text",
      content: payload,
      summary: "Plain-text QR content. It was not sent to Open Food Facts.",
    };
  }

  if (url.protocol !== "https:") {
    return unsupported(
      `This QR code contains a ${url.protocol.replace(":", "").toUpperCase() || "non-web"} link. BioTrace only offers secure HTTPS links.`,
    );
  }
  if (url.username || url.password) {
    return unsupported("This HTTPS link contains embedded sign-in details, so BioTrace will not open it.");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./u, "");
  let path: string;
  try {
    path = decodeURIComponent(url.pathname);
  } catch {
    return unsupported("This QR code contains a malformed product link. Scan the package barcode instead.");
  }

  if (OPEN_FOOD_FACTS_HOSTS.has(hostname)) {
    const match = path.match(/\/product\/(\d{8,14})(?:\/|$)/u);
    if (match && barcodeSchema.safeParse(match[1]).success) {
      return { kind: "barcode", barcode: match[1], source: "open-food-facts-url" };
    }
    return unsupported("This Open Food Facts link does not include a supported product barcode.");
  }

  if (hostname === GS1_DIGITAL_LINK_HOST) {
    const match = path.match(/\/01\/(\d{14})(?:\/|$)/u);
    if (match && barcodeSchema.safeParse(match[1]).success) {
      return { kind: "barcode", barcode: match[1], source: "gs1-digital-link" };
    }
    return unsupported("This GS1 product link does not include a supported GTIN.");
  }

  return { kind: "url", url: url.href, hostname };
}