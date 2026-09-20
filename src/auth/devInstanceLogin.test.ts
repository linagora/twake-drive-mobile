import { isDevInstanceLoginEnabled } from './devInstanceLogin'

describe('isDevInstanceLoginEnabled', () => {
  const dev = __DEV__
  afterEach(() => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = dev
    delete process.env.EXPO_PUBLIC_E2E
  })

  it('is on in a development build', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = true
    expect(isDevInstanceLoginEnabled()).toBe(true)
  })

  it('is on in a build made for the end-to-end runs', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = false
    process.env.EXPO_PUBLIC_E2E = '1'
    expect(isDevInstanceLoginEnabled()).toBe(true)
  })

  it('is off in a shipped build', () => {
    ;(global as unknown as { __DEV__: boolean }).__DEV__ = false
    expect(isDevInstanceLoginEnabled()).toBe(false)
  })
})
