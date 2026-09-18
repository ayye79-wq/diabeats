import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { formatFailureLog, safeFailureReason, writeGitHubFailureSummary } from "./failure-report";

test("reports a missing credential with a safe actionable reason", () => {
  const reason = safeFailureReason(new Error("Content Agent requires the configured AI integration."));

  assert.match(reason, /OPENAI_API_KEY/);
  assert.match(reason, /repository secret/);
  assert.doesNotMatch(reason, /requires the configured AI integration/);
});

test("redacts provider credentials from unexpected errors", () => {
  const log = formatFailureLog(new Error("request failed api_key=sk-proj-1234567890-secret-value"));

  assert.match(log, /Check the workflow logs and retry/);
  assert.doesNotMatch(log, /sk-proj-1234567890-secret-value/);
  assert.doesNotMatch(log, /secret-value/);
});

test("gives rendering failures a concrete next step", () => {
  assert.match(
    safeFailureReason(new Error("ffmpeg exited with 1")),
    /ffmpeg install and the checked-in meal assets/,
  );
});

test("writes a redacted actionable GitHub job summary", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "diabeats-content-agent-summary-"));
  try {
    const summaryPath = path.join(directory, "summary.md");
    await writeGitHubFailureSummary(new Error("OpenAI returned 429: api_key=sk-proj-secret-value"), summaryPath);
    const summary = await readFile(summaryPath, "utf8");

    assert.match(summary, /The scheduled draft was not generated/);
    assert.match(summary, /rate-limited the run/);
    assert.doesNotMatch(summary, /sk-proj-secret-value/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});