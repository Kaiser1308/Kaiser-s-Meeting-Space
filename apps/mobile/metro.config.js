const path = require('node:path');
const fs = require('node:fs');
const { getDefaultConfig } = require('expo/metro-config');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const config = getDefaultConfig(projectRoot);

const pnpmWorkspace = fs.readFileSync(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'utf8');
const virtualStoreMatch = pnpmWorkspace.match(
  /^virtualStoreDir:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/m,
);
const virtualStoreSetting =
  virtualStoreMatch?.[1] ?? virtualStoreMatch?.[2] ?? virtualStoreMatch?.[3];
const virtualStoreRoot = virtualStoreSetting
  ? path.resolve(workspaceRoot, virtualStoreSetting)
  : null;
const virtualStoreRelativeToWorkspace = virtualStoreRoot
  ? path.relative(workspaceRoot, virtualStoreRoot)
  : '';
const virtualStoreIsExternal =
  virtualStoreRelativeToWorkspace === '..' ||
  virtualStoreRelativeToWorkspace.startsWith(`..${path.sep}`) ||
  path.isAbsolute(virtualStoreRelativeToWorkspace);

// Keep Expo/Metro anchored to the mobile app even when the command is
// launched from the workspace root. Workspace packages remain visible to the
// resolver without changing the app entrypoint.
config.projectRoot = projectRoot;
config.watchFolders = [workspaceRoot];

// Metro must watch pnpm symlink targets; this workspace stores them outside the repo.
if (virtualStoreIsExternal && virtualStoreRoot && fs.existsSync(virtualStoreRoot)) {
  config.watchFolders.push(virtualStoreRoot);
}

module.exports = config;
