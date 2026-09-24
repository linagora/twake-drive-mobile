// Modules this app does not install, resolved to an empty stub so a library
// that imports them optionally still bundles.
//
// The store attestation modules are NOT here: they are installed, and the
// flagship certification runs on them.
const STUBBED_MODULES = ['react-native-inappbrowser-reborn']

module.exports = { STUBBED_MODULES }
