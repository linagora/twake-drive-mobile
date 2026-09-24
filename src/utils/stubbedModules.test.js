const { STUBBED_MODULES } = require('./stubbedModules')

describe('STUBBED_MODULES', () => {
  // Stubbing these handed cozy-client a Proxy whose every property is a no-op
  // function: the attestation failed on "generateKey is not a function" and
  // every sign-in fell back to the email code.
  it.each(['react-native-ios11-devicecheck', 'react-native-google-play-integrity'])(
    'leaves %s alone, since the app attests through it',
    name => {
      expect(STUBBED_MODULES).not.toContain(name)
    }
  )

  it('stubs a module the app does not install', () => {
    expect(STUBBED_MODULES).toContain('react-native-inappbrowser-reborn')
  })
})
