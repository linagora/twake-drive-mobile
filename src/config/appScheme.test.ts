import appConfig from '../../app.json'

import { SHARE_SCHEME } from './appIdentifiers'
import { REDIRECT_URL } from '@/auth/pkce'

// expo-linking resolves the first scheme of the Expo config and warns about the
// others, so the one it picks has to be the one the app actually redirects to
// (#178).
describe('app scheme', () => {
  const schemes = appConfig.expo.scheme as string[]

  it('offers the scheme the OAuth redirect comes back on first', () => {
    expect(schemes[0]).toBe(REDIRECT_URL.replace('://', ''))
  })

  it('offers the scheme the share extension redirects to first', () => {
    expect(schemes[0]).toBe(SHARE_SCHEME)
  })

  it('no longer claims the cozy scheme', () => {
    expect(schemes).not.toContain('cozy')
  })
})
