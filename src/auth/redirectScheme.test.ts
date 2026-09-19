import appConfig from '../../app.json'
import { REDIRECT_URL } from './pkce'

// expo-linking resolves the first scheme of the Expo config and ignores the
// rest, so the one the OAuth redirect uses has to come first.
describe('the app schemes', () => {
  it('starts with the scheme the OAuth redirect comes back on', () => {
    const schemes = appConfig.expo.scheme as unknown as string[]
    expect(Array.isArray(schemes)).toBe(true)
    expect(`${schemes[0]}://`).toBe(REDIRECT_URL)
  })
})
