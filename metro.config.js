const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

config.watchFolders = (config.watchFolders || []).filter(
  (folder) => !folder.includes(".local")
);

config.resolver = {
  ...config.resolver,
  blockList: [
    /\.local\/.*/,
    /[\\/]\.cache[\\/].*/,
  ],
};

module.exports = config;
