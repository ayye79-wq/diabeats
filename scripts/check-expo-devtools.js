const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const DEFAULT_PORT = 8099;
const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_READY_GRACE_MS = 1500;
const MAX_CAPTURED_OUTPUT = 256 * 1024;

// These are the direct runtime packages needed by the Electron binary bundled
// in @react-native/debugger-shell. Transitive libraries come from these Nix
// packages, so keep this list aligned with the packages entry in .replit.
const REQUIRED_NIX_PACKAGES = [
  "glib",
  "nss",
  "dbus",
  "atk",
  "at-spi2-atk",
  "cups",
  "cairo",
  "gtk3",
  "pango",
  "xorg.libX11",
  "xorg.libXcomposite",
  "xorg.libXdamage",
  "xorg.libXext",
  "xorg.libXfixes",
  "xorg.libXrandr",
  "mesa",
  "xorg.libxcb",
  "libxkbcommon",
  "alsa-lib",
  "at-spi2-core",
  "nspr",
  "libdrm",
  "expat",
  "systemd",
];

const STARTUP_FAILURE_PATTERNS = [
  {
    kind: "React Native DevTools installation",
    pattern:
      /(?:unexpected error occurred while install(?:ing|ation)|(?:failed|failure|error).{0,160}install(?:ing|ation)?.{0,160}(?:react native )?devtools|install(?:ing|ation)?.{0,160}(?:failed|failure|error).{0,160}(?:react native )?devtools)/i,
  },
  {
    kind: "missing shared library",
    pattern:
      /(?:error while loading shared libraries?|cannot open shared object file|shared (?:library|object).{0,100}(?:not found|missing)|\blib[\w.+-]+\.so(?:\.\d+)*\b.{0,100}(?:not found|cannot open))/i,
  },
];

function parsePositiveInteger(value, fallback, name) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer; received ${value}`);
  }
  return parsed;
}

function readNixRuntimePackages(config = fs.readFileSync(path.join(ROOT, ".replit"), "utf8")) {
  const packagesMatch = config.match(/^\s*packages\s*=\s*\[([\s\S]*?)\]/m);
  if (!packagesMatch) {
    throw new Error("Could not find the [nix] packages entry in .replit");
  }

  return [...packagesMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
}

function findStartupFailures(output) {
  const lines = output.split(/\r?\n/);
  return STARTUP_FAILURE_PATTERNS.flatMap(({ kind, pattern }) =>
    lines
      .filter((line) => pattern.test(line))
      .map((line) => ({ kind, line: line.trim() })),
  );
}

function verifyNixRuntimeContract() {
  const configuredPackages = readNixRuntimePackages();
  const missingPackages = REQUIRED_NIX_PACKAGES.filter(
    (packageName) => !configuredPackages.includes(packageName),
  );

  if (missingPackages.length > 0) {
    throw new Error(
      `The .replit Nix runtime contract is missing React Native DevTools packages: ${missingPackages.join(", ")}`,
    );
  }
}

function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

function runExpoStartupCheck({
  port = parsePositiveInteger(
    process.env.EXPO_DEVTOOLS_CHECK_PORT,
    DEFAULT_PORT,
    "EXPO_DEVTOOLS_CHECK_PORT",
  ),
  timeoutMs = parsePositiveInteger(
    process.env.EXPO_DEVTOOLS_CHECK_TIMEOUT_MS,
    DEFAULT_TIMEOUT_MS,
    "EXPO_DEVTOOLS_CHECK_TIMEOUT_MS",
  ),
  readyGraceMs = parsePositiveInteger(
    process.env.EXPO_DEVTOOLS_CHECK_READY_GRACE_MS,
    DEFAULT_READY_GRACE_MS,
    "EXPO_DEVTOOLS_CHECK_READY_GRACE_MS",
  ),
} = {}) {
  return new Promise((resolve, reject) => {
    const npxCommand = process.platform === "win32" ? "npx.cmd" : "npx";
    const child = spawn(
      npxCommand,
      ["--no-install", "expo", "start", "--localhost", "--port", String(port)],
      {
        cwd: ROOT,
        detached: process.platform !== "win32",
        env: {
          ...process.env,
          BROWSER: "none",
          CI: "1",
          EXPO_NO_DOCTOR: "1",
          EXPO_NO_TELEMETRY: "1",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );

    let output = "";
    let ready = false;
    let stopRequested = false;
    let finished = false;
    let timeoutHandle;
    let readyHandle;

    const capture = (chunk) => {
      output += String(chunk);
      if (output.length > MAX_CAPTURED_OUTPUT) {
        output = output.slice(-MAX_CAPTURED_OUTPUT);
      }

      if (!ready && /waiting on http/i.test(output)) {
        ready = true;
        readyHandle = setTimeout(() => {
          stopRequested = true;
          stopProcess(child);
        }, readyGraceMs);
      }
    };

    const finish = (error) => {
      if (finished) return;
      finished = true;
      clearTimeout(timeoutHandle);
      clearTimeout(readyHandle);
      if (error) {
        reject(error);
      } else {
        resolve({ output, ready, stopRequested, exitCode: child.exitCode });
      }
    };

    child.stdout.on("data", capture);
    child.stderr.on("data", capture);
    child.once("error", (error) => finish(error));
    child.once("close", (code, signal) => {
      if (!stopRequested && !ready && code === 0) {
        finish(new Error("Expo exited before Metro reported a ready server"));
        return;
      }
      finish(null);
    });

    timeoutHandle = setTimeout(() => {
      stopRequested = true;
      stopProcess(child);
    }, timeoutMs);
  });
}

async function main() {
  verifyNixRuntimeContract();

  const result = await runExpoStartupCheck();
  const failures = findStartupFailures(result.output);
  if (failures.length > 0) {
    const evidence = failures
      .map(({ kind, line }) => `- ${kind}: ${line}`)
      .join("\n");
    throw new Error(
      `Expo startup reported React Native DevTools runtime failures:\n${evidence}`,
    );
  }

  if (!result.stopRequested && result.exitCode !== 0) {
    throw new Error(
      `Expo exited before the validation check could stop it (exit code: ${result.exitCode ?? "unknown"})`,
    );
  }

  if (!result.ready) {
    throw new Error(
      "Expo startup check timed out before Metro reported a ready server",
    );
  }

  console.log(
    `Expo startup check passed; Metro became ready on localhost:${process.env.EXPO_DEVTOOLS_CHECK_PORT || DEFAULT_PORT}.`,
  );
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Expo startup check failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  REQUIRED_NIX_PACKAGES,
  findStartupFailures,
  readNixRuntimePackages,
  runExpoStartupCheck,
  verifyNixRuntimeContract,
};