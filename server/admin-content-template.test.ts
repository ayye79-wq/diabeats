import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import vm from "node:vm";

test("keeps TikTok admin actions independently callable from the review page", async () => {
  const template = await readFile(path.join(process.cwd(), "server/templates/admin-content.html"), "utf8");
  const start = template.indexOf("<script>") + "<script>".length;
  const end = template.indexOf("</script>", start);
  const script = template.slice(start, end);
  const element = () => ({
    style: {},
    addEventListener: () => undefined,
    textContent: "",
    disabled: false,
    value: "",
    innerHTML: "",
  });
  const context = vm.createContext({
    URL,
    URLSearchParams,
    document: {
      getElementById: element,
      querySelectorAll: () => [],
    },
    window: { confirm: () => false, location: { assign: () => undefined } },
    fetch: async () => new Response(),
    console,
  });

  vm.runInContext(`${script}\nglobalThis.__actions = { connectTikTok, uploadToTikTok, resolveTikTokUpload };`, context);
  const actions = (context as typeof context & { __actions: Record<string, unknown> }).__actions;
  assert.equal(typeof actions.connectTikTok, "function");
  assert.equal(typeof actions.uploadToTikTok, "function");
  assert.equal(typeof actions.resolveTikTokUpload, "function");
});