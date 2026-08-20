const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*"],
    rules: {
      // React Native renders text nodes directly, so HTML entity escaping is not needed.
      "react/no-unescaped-entities": "off",
      // These existing flows intentionally initialize async UI state from effects.
      "react-hooks/immutability": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  }
]);
