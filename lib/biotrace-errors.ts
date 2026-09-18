const NOT_FOUND_MESSAGE =
  "We couldn't find that product in the approved food sources. Check the barcode or try searching by name.";
const BUSY_MESSAGE = "Product lookup is temporarily busy. Please wait a moment and try again.";
const UNAVAILABLE_MESSAGE = "Food data providers are unavailable right now. Please try again shortly.";

export function readableBioTraceError(error: unknown, fallback = "Could not look up this product."): string {
  const message = error instanceof Error ? error.message : "";
  const statusMatch = message.match(/^(\d{3}):/u);
  const status = statusMatch ? Number(statusMatch[1]) : null;

  if (status === 404) return NOT_FOUND_MESSAGE;
  if (status === 429) return BUSY_MESSAGE;
  if (status === 503 || (status !== null && status >= 500)) return UNAVAILABLE_MESSAGE;
  if (status === 400) return "That barcode is not valid. Check the digits and try again.";

  // API/provider response bodies are deliberately never echoed to users.
  return fallback;
}