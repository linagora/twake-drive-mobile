import { adoptStoredToken } from './adoptStoredToken'
import * as tokenStorage from './tokenStorage'

const session = (accessToken: string) =>
  ({
    uri: 'https://example.localhost',
    oauthOptions: { clientID: 'cid', clientSecret: 'secret' },
    token: { accessToken, refreshToken: `refresh-${accessToken}` }
  }) as unknown as Awaited<ReturnType<typeof tokenStorage.getSession>>

const clientHolding = (accessToken: string | undefined, setToken = jest.fn()) =>
  ({
    getStackClient: () => ({ token: accessToken ? { accessToken } : undefined, setToken })
  }) as unknown as import('cozy-client').default

describe('adoptStoredToken', () => {
  afterEach(() => jest.restoreAllMocks())

  it('takes on the token the keychain holds when it is another one', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(session('rotated'))
    const setToken = jest.fn()

    await expect(adoptStoredToken(clientHolding('spent', setToken))).resolves.toBe(true)
    expect(setToken).toHaveBeenCalledWith(
      expect.objectContaining({ accessToken: 'rotated', refreshToken: 'refresh-rotated' })
    )
  })

  it('leaves the client alone when it already holds that token', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(session('same'))
    const setToken = jest.fn()

    await expect(adoptStoredToken(clientHolding('same', setToken))).resolves.toBe(false)
    expect(setToken).not.toHaveBeenCalled()
  })

  it('answers false when the keychain holds nothing', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(null)

    await expect(adoptStoredToken(clientHolding('spent'))).resolves.toBe(false)
  })

  it('answers false without a client, or without a stack client to set it on', async () => {
    jest.spyOn(tokenStorage, 'getSession').mockResolvedValue(session('rotated'))

    await expect(adoptStoredToken(null)).resolves.toBe(false)
    await expect(
      adoptStoredToken({
        getStackClient: () => undefined
      } as unknown as import('cozy-client').default)
    ).resolves.toBe(false)
  })
})
