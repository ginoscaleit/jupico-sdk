const path = require('path');
const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

// The SDK lives one directory up. Metro must (a) watch it so edits to src/
// hot-reload, and (b) resolve react / react-native from THIS app's copy so we
// don't end up with two React instances.
const root = path.resolve(__dirname, '..');
const escape = s => s.replace(/[/\-\\^$*+?.()|[\]{}]/g, '\\$&');

const config = {
  watchFolders: [root],
  resolver: {
    // extraNodeModules is only a fallback: files under ../src would still find
    // ../node_modules/react-native first (the SDK's devDependency), giving a
    // second RN copy whose view-config registry the renderer never sees
    // ("View config getter callback ... must be a function"). Block it.
    blockList: new RegExp(`^${escape(path.join(root, 'node_modules'))}/.*$`),
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
