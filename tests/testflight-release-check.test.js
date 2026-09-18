const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const test = require("node:test");

const {
  createAppStoreBuildUrl,
  createAscToken,
  EAS_UPLOAD_SUCCESS_STATES,
  ASC_PROCESSING_STATE,
  ASC_PROCESSED_STATE,
  getPollingOptions,
  getEasStatus,
  getEasSubmissionBuildId,
  getEasSubmissionIdFromOutput,
  getReleaseMetadata,
  parseJsonOutput,
  validateEasPair,
  waitForAppStoreBuild,
} = require("../scripts/check-testflight.js");

test("queries App Store Connect by build number and includes the marketing version", () => {
  const url = createAppStoreBuildUrl({
    appId: "6760898764",
    buildNumber: "40",
  });

  assert.equal(url.searchParams.get("filter[app]"), "6760898764");
  assert.equal(url.searchParams.get("filter[version]"), "40");
  assert.equal(url.searchParams.get("filter[buildNumber]"), null);
  assert.equal(url.searchParams.get("include"), "preReleaseVersion");
});

test("signs App Store Connect tokens when the private key is compact PEM", () => {
  const { privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const compactPem = privateKey
    .export({ type: "pkcs8", format: "pem" })
    .replace(/\r?\n/g, "");

  assert.equal(
    createAscToken({
      keyId: "TESTKEY",
      issuerId: "test-issuer",
      privateKey: compactPem,
      now: 1_700_000_000,
    }).split(".").length,
    3,
  );
});

test("parses EAS JSON with informational output before the document", () => {
  const parsed = parseJsonOutput('warning: using cached project\n{"status":"finished"}', "EAS");
  assert.equal(parsed.status, "finished");
});

test("extracts version and build number from EAS iOS metadata", () => {
  const metadata = getReleaseMetadata(
    { appVersion: "1.3.3", appBuildVersion: "36" },
    { status: "finished" },
  );

  assert.deepEqual(metadata, { appVersion: "1.3.3", buildNumber: "36" });
});

test("supports nested EAS response data and submission fallbacks", () => {
  const submission = { data: [{ status: "finished", appVersion: "2.0.0", buildNumber: 8 }] };
  const build = { data: [{ status: "finished" }] };

  assert.equal(getEasStatus(submission.data[0]), "finished");
  assert.deepEqual(getReleaseMetadata(build, submission), {
    appVersion: "2.0.0",
    buildNumber: 8,
  });
});

test("only completed EAS submissions count as uploaded", () => {
  assert.equal(EAS_UPLOAD_SUCCESS_STATES.has("finished"), true);
  assert.equal(EAS_UPLOAD_SUCCESS_STATES.has("processing"), false);
});

test("rejects an EAS submission paired with a different build", () => {
  const submission = { id: "submission-1", submittedBuild: { id: "build-1" } };
  const build = { id: "build-2" };

  assert.equal(getEasSubmissionBuildId(submission), "build-1");
  assert.throws(() => validateEasPair(build, submission), /IDs do not match/);
});

test("requires the submittedBuild relationship from EAS", () => {
  assert.throws(
    () => validateEasPair({ id: "build-1" }, { id: "submission-1" }),
    /did not include its linked build ID/,
  );
});

test("accepts the current EAS submittedBuild response shape for the same build", () => {
  assert.doesNotThrow(() =>
    validateEasPair(
      { id: "build-1" },
      { id: "submission-1", submittedBuild: { id: "build-1" } },
    ),
  );
});

test("extracts the submission created by the specific EAS Submit invocation", () => {
  const olderSubmissionId = "11111111-1111-4111-8111-111111111111";
  const createdSubmissionId = "22222222-2222-4222-8222-222222222222";
  const output = [
    `Previous submission: https://expo.dev/submissions/${olderSubmissionId}`,
    `Submission details: https://expo.dev/accounts/owner/projects/app/submissions/${createdSubmissionId}`,
  ].join("\n");

  assert.equal(getEasSubmissionIdFromOutput(output), createdSubmissionId);
});

test("validates polling options before contacting App Store Connect", () => {
  assert.deepEqual(getPollingOptions({}), {
    pollIntervalSeconds: 0,
    maxWaitSeconds: 0,
  });
  assert.deepEqual(
    getPollingOptions({
      "poll-interval-seconds": "30",
      "max-wait-seconds": "900",
    }),
    { pollIntervalSeconds: 30, maxWaitSeconds: 900 },
  );
  assert.throws(
    () => getPollingOptions({ "poll-interval-seconds": "30" }),
    /positive maximum wait/,
  );
});

test("polls a processing build until App Store Connect reports VALID", async () => {
  const responses = [
    { processingState: ASC_PROCESSING_STATE },
    { processingState: ASC_PROCESSED_STATE, appVersion: "1.3.4", buildNumber: "39" },
  ];
  const delays = [];

  const result = await waitForAppStoreBuild({
    appId: "6760898764",
    appVersion: "1.3.4",
    buildNumber: "39",
    pollIntervalSeconds: 30,
    maxWaitSeconds: 900,
    fetchBuild: async () => responses.shift(),
    sleep: async (delayMs) => delays.push(delayMs),
  });

  assert.deepEqual(result, {
    processingState: ASC_PROCESSED_STATE,
    appVersion: "1.3.4",
    buildNumber: "39",
  });
  assert.deepEqual(delays, [30_000]);
});