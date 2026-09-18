import assert from "node:assert/strict";
import { test } from "node:test";
import {
  TikTokFlowError,
  assertTikTokUploadAllowed,
  canResolveTikTokUpload,
  decryptTikTokRecord,
  encryptTikTokRecord,
} from "./tiktok";

test("encrypts TikTok records so token material is not stored as plaintext", () => {
  const previous = process.env.SESSION_SECRET;
  process.env.SESSION_SECRET = "test-session-secret";
  try {
    const tokens = { accessToken: "access-secret", refreshToken: "refresh-secret", expiresAt: "2030-01-01T00:00:00.000Z" };
    const encrypted = encryptTikTokRecord(tokens);
    assert.equal(encrypted.includes("access-secret"), false);
    assert.equal(encrypted.includes("refresh-secret"), false);
    assert.deepEqual(decryptTikTokRecord<typeof tokens>(encrypted), tokens);
  } finally {
    if (previous === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous;
  }
});

test("permits recovery only before transfer or after explicit Inbox review", () => {
  const staleReserved = { status: "uploading" as const, phase: "reserved" as const, updatedAt: "2020-01-01T00:00:00.000Z" };
  assert.match(canResolveTikTokUpload(staleReserved, "retry_reserved"), /did not begin/);
  assert.throws(
    () => canResolveTikTokUpload(staleReserved, "confirm_not_in_inbox"),
    (error: unknown) => error instanceof TikTokFlowError && error.code === "duplicate_upload",
  );

  const uncertainTransfer = { status: "uploading" as const, phase: "transfer_started" as const, updatedAt: "2020-01-01T00:00:00.000Z" };
  assert.throws(
    () => canResolveTikTokUpload(uncertainTransfer, "retry_reserved"),
    (error: unknown) => error instanceof TikTokFlowError && error.code === "duplicate_upload",
  );
  assert.match(canResolveTikTokUpload(uncertainTransfer, "confirm_not_in_inbox"), /Manually cleared/);
});

test("requires approval and blocks successful or active duplicate Inbox uploads", () => {
  assert.throws(
    () => assertTikTokUploadAllowed("draft", null),
    (error: unknown) => error instanceof TikTokFlowError && error.code === "not_approved",
  );
  assert.throws(
    () => assertTikTokUploadAllowed("approved", { status: "succeeded", publishId: "publish-123", updatedAt: new Date().toISOString() }),
    (error: unknown) => error instanceof TikTokFlowError && error.code === "duplicate_upload",
  );
  assert.throws(
    () => assertTikTokUploadAllowed("approved", { status: "uploading", updatedAt: "2020-01-01T00:00:00.000Z" }),
    (error: unknown) => error instanceof TikTokFlowError && error.code === "duplicate_upload",
  );
  assert.doesNotThrow(() =>
    assertTikTokUploadAllowed("approved", { status: "failed", error: "network error", updatedAt: new Date().toISOString() }),
  );
});