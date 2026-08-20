import test from "node:test";
import assert from "node:assert/strict";

const imageSize = require("../vendor/image-size");

function webp(chunk: string, bytes: number[]) {
  return Buffer.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP"), ...Buffer.from(chunk), ...bytes]);
}

test("reads bounded VP8 and VP8L WebP dimensions", () => {
  const vp8 = webp("VP8 ", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x10, 0, 0x08, 0]);
  assert.deepEqual(imageSize(vp8), { width: 16, height: 8, type: "webp" });

  const bits = ((7 << 14) | 15) >>> 0;
  const vp8l = webp("VP8L", [0, 0, 0, 0, 0, bits & 255, (bits >>> 8) & 255, (bits >>> 16) & 255, (bits >>> 24) & 255]);
  assert.deepEqual(imageSize(vp8l), { width: 16, height: 8, type: "webp" });
});

test("rejects oversized and unsupported image input", () => {
  assert.throws(() => imageSize(Buffer.alloc(65 * 1024 * 1024)));
  assert.throws(() => imageSize(Buffer.from("not-an-image")));
});