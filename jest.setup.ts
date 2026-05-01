import '@testing-library/react-native/extend-expect'

// Use node-fetch (http-based) so nock can intercept HTTP requests in tests.
// Node 18+'s built-in fetch uses undici, which nock cannot intercept by default.
const nodeFetch = require('node-fetch')
;(global as unknown as { fetch: unknown }).fetch = nodeFetch

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn()
}))

jest.mock('expo-web-browser', () => ({
  openAuthSessionAsync: jest.fn(),
  WebBrowserResultType: {
    SUCCESS: 'success',
    CANCEL: 'cancel',
    DISMISS: 'dismiss'
  }
}))

jest.mock('expo-localization', () => ({
  getLocales: () => [{ languageCode: 'fr', languageTag: 'fr-FR' }]
}))
