import assert from "node:assert/strict";
import test from "node:test";
import { parseScanInput } from "../shared/scan-input";

test("routes barcodes and product URLs to exact lookup", () => {
  assert.deepEqual(parseScanInput("12345678"), { kind: "barcode", value: "12345678" });
  assert.deepEqual(parseScanInput("https://world.openfoodfacts.org/product/1234567890123/example"), { kind: "barcode", value: "1234567890123" });
});

test("routes produce names to search without inventing nutrition", () => {
  assert.deepEqual(parseScanInput("yellow onion"), { kind: "product-query", value: "yellow onion" });
});

test("only opens the test menu schema when explicitly marked test-only", () => {
  assert.equal(parseScanInput('{"schema":"diabeats.test.menu.v1","test_only":true}').kind, "test-menu");
  assert.equal(parseScanInput('{"schema":"diabeats.test.menu.v1","test_only":false}').kind, "unsupported");
});
