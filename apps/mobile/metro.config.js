const { getDefaultConfig } = require('expo/metro-config');
const { realpathSync } = require('node:fs');
const path = require('node:path');

const config = getDefaultConfig(__dirname);

// npm workspaces use a junction whose target stays on C:\ even when the build
// runs from a SUBST drive. Metro must see that real target to follow the link.
// Keep Expo's resolver/exports and automatic monorepo configuration intact.
const sharedRoot = realpathSync.native(path.resolve(__dirname, '../../packages/shared'));
config.watchFolders = [...new Set([...config.watchFolders, sharedRoot])];

module.exports = config;
