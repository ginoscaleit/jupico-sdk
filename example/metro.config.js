const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The SDK lives one directory up. Metro must (a) watch it so edits to src/
// hot-reload, and (b) resolve react / react-native from THIS app's copy so we
// don't end up with two React instances.
const root = path.resolve(__dirname, '..');

const config = {
  watchFolders: [root],
  resolver: {
    nodeModulesPaths: [path.resolve(__dirname, 'node_modules')],
    extraNodeModules: new Proxy(
      {},
      {
        get: (_target, name) =>
          path.join(__dirname, 'node_modules', name.toString()),
      },
    ),
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
