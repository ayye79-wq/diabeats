const { spawnSync } = require("node:child_process");

function audit(label, args) {
  const result = spawnSync("npm", ["audit", "--json", ...args], { encoding: "utf8" });
  try {
    const report = JSON.parse(result.stdout);
    console.log(`${label}:`, report.metadata?.vulnerabilities ?? "unavailable");
  } catch {
    console.error(`${label}: audit output could not be read`);
    process.exitCode = 1;
  }
}

console.log("DiabEats dependency health");
audit("Production dependencies", ["--omit=dev"]);
audit("Full dependency tree", []);
console.log("Review SECURITY_ACCEPTANCE.md for any approved exceptions and reassessment date.");