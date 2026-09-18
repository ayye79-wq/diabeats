const test = require("node:test");
const assert = require("node:assert/strict");

const {
  findStartupFailures,
  readNixRuntimePackages,
  REQUIRED_NIX_PACKAGES,
} = require("../scripts/check-expo-devtools");

test("recognizes the bundled DevTools installation failure", () => {
  const failures = findStartupFailures(
    "An unexpected error occurred while installing the latest version of React Native DevTools.",
  );

  assert.deepEqual(
    failures.map(({ kind }) => kind),
    ["React Native DevTools installation"],
  );
});

test("recognizes missing shared libraries", () => {
  const failures = findStartupFailures(
    "React Native DevTools: error while loading shared libraries: libatk-1.0.so.0: cannot open shared object file: No such file or directory",
  );

  assert.deepEqual(
    failures.map(({ kind }) => kind),
    ["missing shared library"],
  );
});

test("does not reject normal Metro startup output", () => {
  assert.deepEqual(
    findStartupFailures(
      "Starting Metro Bundler\nWaiting on http://localhost:8099",
    ),
    [],
  );
});

test("the checked-in Nix contract includes every required runtime package", () => {
  const configuredPackages = readNixRuntimePackages();
  const missingPackages = REQUIRED_NIX_PACKAGES.filter(
    (packageName) => !configuredPackages.includes(packageName),
  );

  assert.deepEqual(missingPackages, []);
});