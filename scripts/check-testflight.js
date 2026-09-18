#!/usr/bin/env node

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const ASC_API_URL = "https://api.appstoreconnect.apple.com/v1/builds";
const EAS_UPLOAD_SUCCESS_STATES = new Set([
  "complete",
  "completed",
  "finished",
  "succeeded",
]);
const ASC_PROCESSED_STATE = "VALID";
const ASC_PROCESSING_STATE = "PROCESSING";

class ReleaseCheckError extends Error {}

function parseJsonOutput(raw, label) {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new ReleaseCheckError(`${label} returned no JSON.`);
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    // EAS can print a short informational line before its JSON output.
    const start = trimmed.search(/[\[{]/);
    if (start < 0) {
      throw new ReleaseCheckError(`${label} returned invalid JSON.`);
    }

    for (let end = trimmed.length; end > start; end -= 1) {
      try {
        return JSON.parse(trimmed.slice(start, end));
      } catch {
        // Keep looking for the end of the JSON document.
      }
    }
  }

  throw new ReleaseCheckError(`${label} returned invalid JSON.`);
}

function readJsonFile(filePath, label) {
  try {
    return parseJsonOutput(fs.readFileSync(filePath, "utf8"), label);
  } catch (error) {
    if (error instanceof ReleaseCheckError) {
      throw error;
    }
    throw new ReleaseCheckError(`Could not read ${label}.`);
  }
}

function unwrapEasRecord(value) {
  if (Array.isArray(value)) {
    return value[0] || {};
  }
  if (value && typeof value === "object" && Array.isArray(value.data)) {
    return value.data[0] || {};
  }
  if (value && typeof value === "object" && value.data && typeof value.data === "object") {
    return value.data;
  }
  return value && typeof value === "object" ? value : {};
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "");
}

function getEasStatus(record) {
  return String(firstValue(record.status, record.state, "unknown")).trim().toLowerCase();
}

function getEasSubmissionBuildId(submissionRecord) {
  const submission = unwrapEasRecord(submissionRecord);
  return firstValue(
    submission.submittedBuild?.id,
    submission.buildId,
    submission.iosBuildId,
    submission.build?.id,
    submission.iosBuild?.id,
  );
}

function getEasSubmissionIdFromOutput(raw) {
  const lines = String(raw).split(/\r?\n/);
  const detailsLine = lines.find((line) => line.includes("Submission details:"));
  const match = detailsLine?.match(/\/submissions\/([0-9a-f-]{36})(?:[/?#\s]|$)/i);

  if (!match) {
    throw new ReleaseCheckError(
      "EAS Submit output did not include the created submission ID.",
    );
  }

  return match[1];
}

function validateEasPair(buildRecord, submissionRecord) {
  const build = unwrapEasRecord(buildRecord);
  const submissionBuildId = getEasSubmissionBuildId(submissionRecord);
  const buildId = firstValue(build.id, build.buildId);

  if (!submissionBuildId) {
    throw new ReleaseCheckError(
      "The EAS submission did not include its linked build ID. Use an EAS CLI response with submittedBuild.id.",
    );
  }

  if (!buildId || String(submissionBuildId) !== String(buildId)) {
    throw new ReleaseCheckError("The EAS submission and build IDs do not match.");
  }
}

function getReleaseMetadata(buildRecord, submissionRecord) {
  const build = unwrapEasRecord(buildRecord);
  const submission = unwrapEasRecord(submissionRecord);

  return {
    appVersion: firstValue(
      build.appVersion,
      build.version,
      build.ios?.appVersion,
      build.ios?.version,
      build.metadata?.appVersion,
      submission.appVersion,
      submission.version,
    ),
    buildNumber: firstValue(
      build.appBuildVersion,
      build.buildNumber,
      build.ios?.appBuildVersion,
      build.ios?.buildNumber,
      build.metadata?.buildNumber,
      submission.appBuildVersion,
      submission.buildNumber,
    ),
  };
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(privateKey) {
  const begin = "-----BEGIN PRIVATE KEY-----";
  const end = "-----END PRIVATE KEY-----";
  const normalized = String(privateKey).replace(/\\n/g, "\n");
  const beginIndex = normalized.indexOf(begin);
  const endIndex = normalized.indexOf(end);

  if (beginIndex < 0 || endIndex < beginIndex) {
    return normalized;
  }

  const body = normalized
    .slice(beginIndex + begin.length, endIndex)
    .replace(/\s/g, "");
  const lines = body.match(/.{1,64}/g);
  return lines ? `${begin}\n${lines.join("\n")}\n${end}\n` : normalized;
}

function createAscToken({ keyId, issuerId, privateKey, now = Math.floor(Date.now() / 1000) }) {
  const header = base64UrlEncode(JSON.stringify({ alg: "ES256", kid: keyId, typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      iss: issuerId,
      iat: now - 30,
      exp: now + 600,
      aud: "appstoreconnect-v1",
    }),
  );
  const unsignedToken = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(unsignedToken), {
    key: normalizePrivateKey(privateKey),
    dsaEncoding: "ieee-p1363",
  });

  return `${unsignedToken}.${signature.toString("base64url")}`;
}

function getAscCredentials() {
  const keyId = process.env.ASC_API_KEY_ID || process.env.ASC_KEY_ID;
  const issuerId = process.env.ASC_API_ISSUER_ID || process.env.ASC_ISSUER_ID;
  const privateKey = process.env.ASC_API_PRIVATE_KEY || process.env.ASC_PRIVATE_KEY;

  if (!keyId || !issuerId || !privateKey) {
    throw new ReleaseCheckError(
      "App Store Connect credentials are not configured. Set ASC_API_KEY_ID, ASC_API_ISSUER_ID, and ASC_API_PRIVATE_KEY.",
    );
  }

  return { keyId, issuerId, privateKey };
}

function createAppStoreBuildUrl({ appId, buildNumber }) {
  const url = new URL(ASC_API_URL);
  url.searchParams.set("filter[app]", String(appId));
  url.searchParams.set("filter[version]", String(buildNumber));
  url.searchParams.set("include", "preReleaseVersion");
  url.searchParams.set("limit", "1");
  return url;
}

async function fetchAppStoreBuild({ appId, appVersion, buildNumber }) {
  const credentials = getAscCredentials();
  const url = createAppStoreBuildUrl({ appId, buildNumber });

  let response;
  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${createAscToken(credentials)}`,
      },
    });
  } catch {
    throw new ReleaseCheckError("Could not reach App Store Connect.");
  }

  if (!response.ok) {
    // Do not print the response body: provider errors may echo request details.
    throw new ReleaseCheckError(`App Store Connect returned HTTP ${response.status}.`);
  }

  let body;
  try {
    body = await response.json();
  } catch {
    throw new ReleaseCheckError("App Store Connect returned invalid JSON.");
  }

  const build = body?.data?.[0];
  if (!build) {
    return null;
  }

  const preReleaseVersionId = build.relationships?.preReleaseVersion?.data?.id;
  const preReleaseVersion = body?.included?.find(
    (record) =>
      record.type === "preReleaseVersions" &&
      (!preReleaseVersionId || record.id === preReleaseVersionId),
  );
  const resolvedAppVersion = preReleaseVersion?.attributes?.version || appVersion;
  if (
    resolvedAppVersion &&
    appVersion &&
    String(resolvedAppVersion).trim() !== String(appVersion).trim()
  ) {
    throw new ReleaseCheckError(
      `App Store Connect build ${buildNumber} belongs to app version ${resolvedAppVersion}, not ${appVersion}.`,
    );
  }

  return {
    appVersion: resolvedAppVersion,
    buildNumber: build.attributes?.version,
    processingState: String(build.attributes?.processingState || "UNKNOWN").toUpperCase(),
    appStoreState: null,
  };
}

function getPollingOptions(args) {
  const pollIntervalSeconds = args["poll-interval-seconds"]
    ? Number(args["poll-interval-seconds"])
    : 0;
  const maxWaitSeconds = args["max-wait-seconds"]
    ? Number(args["max-wait-seconds"])
    : 0;

  if (
    !Number.isFinite(pollIntervalSeconds) ||
    pollIntervalSeconds < 0 ||
    !Number.isFinite(maxWaitSeconds) ||
    maxWaitSeconds < 0
  ) {
    throw new ReleaseCheckError(
      "Polling interval and maximum wait must be non-negative numbers.",
    );
  }

  if (pollIntervalSeconds > 0 && maxWaitSeconds === 0) {
    throw new ReleaseCheckError(
      "A positive polling interval requires a positive maximum wait.",
    );
  }

  return { pollIntervalSeconds, maxWaitSeconds };
}

async function waitForAppStoreBuild({
  appId,
  appVersion,
  buildNumber,
  pollIntervalSeconds,
  maxWaitSeconds,
  fetchBuild = fetchAppStoreBuild,
  sleep = (delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs)),
}) {
  let appStoreBuild = await fetchBuild({ appId, appVersion, buildNumber });
  if (
    appStoreBuild?.processingState !== ASC_PROCESSING_STATE ||
    pollIntervalSeconds <= 0 ||
    maxWaitSeconds <= 0
  ) {
    return appStoreBuild;
  }

  const deadline = Date.now() + maxWaitSeconds * 1000;
  while (appStoreBuild?.processingState === ASC_PROCESSING_STATE) {
    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) {
      break;
    }

    const delayMs = Math.min(pollIntervalSeconds * 1000, remainingMs);
    console.log(
      `App Store Connect is still processing; checking again in ${Math.ceil(delayMs / 1000)} seconds.`,
    );
    await sleep(delayMs);
    appStoreBuild = await fetchBuild({ appId, appVersion, buildNumber });
  }

  return appStoreBuild;
}

function printReport({ submissionStatus, appVersion, buildNumber, appStoreBuild }) {
  const uploadComplete = EAS_UPLOAD_SUCCESS_STATES.has(submissionStatus);
  const processingState = appStoreBuild?.processingState || "NOT_FOUND";
  const testFlightAvailable = processingState === ASC_PROCESSED_STATE;

  console.log(`App version: ${appVersion || "unknown"}`);
  console.log(`Build number: ${buildNumber || "unknown"}`);
  console.log(
    `EAS upload: ${uploadComplete ? "COMPLETE" : "NOT COMPLETE"} (submission state: ${submissionStatus.toUpperCase()})`,
  );
  console.log(`App Store Connect processing state: ${processingState}`);
  console.log(`TestFlight availability: ${testFlightAvailable ? "AVAILABLE" : "NOT AVAILABLE"}`);

  if (appStoreBuild?.appStoreState) {
    console.log(`App Store state: ${appStoreBuild.appStoreState}`);
  }

  return { uploadComplete, processingState, testFlightAvailable };
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      throw new ReleaseCheckError(`Unexpected argument: ${argument}`);
    }
    const name = argument.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new ReleaseCheckError(`Missing value for --${name}.`);
    }
    args[name] = value;
    index += 1;
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args["submission-json"] || !args["build-json"] || !args["asc-app-id"]) {
    throw new ReleaseCheckError(
      "Usage: node scripts/check-testflight.js --submission-json FILE --build-json FILE --asc-app-id APP_ID [--poll-interval-seconds SECONDS --max-wait-seconds SECONDS]",
    );
  }

  const submissionRecord = unwrapEasRecord(
    readJsonFile(path.resolve(args["submission-json"]), "EAS submission"),
  );
  const buildRecord = unwrapEasRecord(readJsonFile(path.resolve(args["build-json"]), "EAS build"));
  validateEasPair(buildRecord, submissionRecord);
  const submissionStatus = getEasStatus(submissionRecord);
  const metadata = getReleaseMetadata(buildRecord, submissionRecord);

  if (!metadata.appVersion || !metadata.buildNumber) {
    throw new ReleaseCheckError(
      "EAS metadata did not include both an app version and build number.",
    );
  }

  if (!EAS_UPLOAD_SUCCESS_STATES.has(submissionStatus)) {
    printReport({
      submissionStatus,
      appVersion: metadata.appVersion,
      buildNumber: metadata.buildNumber,
      appStoreBuild: null,
    });
    return 1;
  }

  const polling = getPollingOptions(args);
  const appStoreBuild = await waitForAppStoreBuild({
    appId: args["asc-app-id"],
    appVersion: metadata.appVersion,
    buildNumber: metadata.buildNumber,
    ...polling,
  });
  const report = printReport({
    submissionStatus,
    appVersion: appStoreBuild?.appVersion || metadata.appVersion,
    buildNumber: appStoreBuild?.buildNumber || metadata.buildNumber,
    appStoreBuild,
  });

  return report.processingState === ASC_PROCESSED_STATE ? 0 : 1;
}

if (require.main === module) {
  main()
    .then((exitCode) => {
      process.exitCode = exitCode;
    })
    .catch((error) => {
      if (error instanceof ReleaseCheckError) {
        console.error(`Release check failed: ${error.message}`);
      } else {
        console.error("Release check failed unexpectedly.");
      }
      process.exitCode = 1;
    });
}

module.exports = {
  ASC_PROCESSED_STATE,
  ASC_PROCESSING_STATE,
  EAS_UPLOAD_SUCCESS_STATES,
  createAppStoreBuildUrl,
  createAscToken,
  getPollingOptions,
  getEasStatus,
  getReleaseMetadata,
  getEasSubmissionBuildId,
  getEasSubmissionIdFromOutput,
  parseJsonOutput,
  printReport,
  validateEasPair,
  waitForAppStoreBuild,
};