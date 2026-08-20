const { execSync } = require("child_process");
const path = require("path");

const root = path.resolve(__dirname, "..");

execSync("npx expo export --platform web --output-dir static-build", {
  cwd: root,
  stdio: "inherit",
  env: {
    ...process.env,
    NODE_ENV: "production",
  },
});
