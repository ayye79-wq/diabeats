import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("the checked-in promo preview renderer keeps MP4 and creates a WebM sidecar", async () => {
  const source = await readFile(
    path.join(path.dirname(fileURLToPath(import.meta.url)), "render-promo-preview.ts"),
    "utf8",
  );

  assert.match(source, /const previewPath = .*\.mp4/u);
  assert.match(source, /const browserPreviewPath = .*\.webm/u);
  assert.match(source, /renderBrowserPreview, renderVerticalVideo/u);
  assert.match(source, /await renderVerticalVideo\(/u);
  assert.match(source, /await renderBrowserPreview\(previewPath, browserPreviewPath\)/u);
});