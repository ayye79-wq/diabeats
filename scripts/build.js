const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const appConfigPath = path.join(root, "app.json");
const originalAppConfig = fs.readFileSync(appConfigPath, "utf8");

try {
  const appConfig = JSON.parse(originalAppConfig);
  appConfig.expo.experiments = {
    ...appConfig.expo.experiments,
    // Preview serves the exported web app below /app. Bake that mount path
    // into the web bundle without changing the native Expo configuration.
    baseUrl: "/app",
  };
  fs.writeFileSync(appConfigPath, `${JSON.stringify(appConfig, null, 2)}\n`);

  execSync("npx expo export --platform web --output-dir static-build", {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      NODE_ENV: "production",
    },
  });
} finally {
  fs.writeFileSync(appConfigPath, originalAppConfig);
}
