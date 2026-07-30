const path = require('node:path');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

// Keep Expo/Metro anchored to the mobile app even when the command is
// launched from the workspace root. Workspace packages remain visible to the
// resolver without changing the app entrypoint.
config.projectRoot = projectRoot;
config.watchFolders = [workspaceRoot];

module.exports = config;
