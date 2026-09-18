const path = require('path')
const { getDefaultConfig } = require('expo/metro-config')

const config = getDefaultConfig(__dirname)

// Allow bundling OnlyOffice templates as binary assets via require(), and the
// editors the app embeds as a single HTML file each (see scripts/build-*.mjs).
config.resolver.assetExts = [
  ...new Set([...config.resolver.assetExts, 'docx', 'xlsx', 'pptx', 'html'])
]

// Keep test files out of the runtime bundle: expo-router otherwise picks up
// app/**/*.test.tsx as routes and crashes on `jest.fn()` at evaluation time.
const TEST_FILE_RE = /[/\\]app[/\\].*\.test\.(tsx?|jsx?)$/
config.resolver.blockList = config.resolver.blockList
  ? Array.isArray(config.resolver.blockList)
    ? [...config.resolver.blockList, TEST_FILE_RE]
    : [config.resolver.blockList, TEST_FILE_RE]
  : TEST_FILE_RE

const stub = path.resolve(__dirname, 'src/utils/emptyModule.js')

const STUBBED = new Set([
  'react-native-inappbrowser-reborn',
  'react-native-ios11-devicecheck',
  'react-native-google-play-integrity'
])

const upstreamResolveRequest = config.resolver.resolveRequest
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (STUBBED.has(moduleName)) {
    return { type: 'sourceFile', filePath: stub }
  }
  if (upstreamResolveRequest) {
    return upstreamResolveRequest(context, moduleName, platform)
  }
  return context.resolveRequest(context, moduleName, platform)
}

module.exports = config
