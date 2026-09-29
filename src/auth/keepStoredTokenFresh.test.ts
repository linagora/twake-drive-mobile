import type CozyClient from 'cozy-client'

import { keepStoredTokenFresh } from './keepStoredTokenFresh'
import { getSession, saveSession } from './tokenStorage'
import type { Session } from './types'

jest.mock('./tokenStorage', () => ({
  getSession: jest.fn(),
  saveSession: jest.fn().mockResolvedValue(undefined)
}))

const storedSession: Session = {
  uri: 'https://alice.example.com',
  oauthOptions: {
    clientID: 'client-1',
    clientSecret: 'secret-1',
    clientName: 'Twake Drive',
    softwareID: 'twake-drive-mobile',
    redirectURI: 'twakedrive://auth',
    clientKind: 'mobile',
    clientURI: 'https://twake.app',
    scopes: ['io.cozy.files']
  },
  token: {
    accessToken: 'old-access',
    refreshToken: 'refresh-1',
    tokenType: 'bearer',
    scope: 'io.cozy.files'
  }
}

interface FakeClient {
  client: CozyClient
  refresh: () => void
  listeners: number
}

const makeClient = (token: unknown): FakeClient => {
  const handlers: Record<string, ((...args: unknown[]) => void)[]> = {}
  const fake = {
    on: (event: string, listener: (...args: unknown[]) => void) => {
      ;(handlers[event] ??= []).push(listener)
    },
    removeListener: (event: string, listener: (...args: unknown[]) => void) => {
      handlers[event] = (handlers[event] ?? []).filter(l => l !== listener)
    },
    getStackClient: () => ({ token })
  }
  return {
    client: fake as unknown as CozyClient,
    refresh: () => (handlers.tokenRefreshed ?? []).forEach(l => l()),
    get listeners() {
      return (handlers.tokenRefreshed ?? []).length
    }
  } as FakeClient
}

describe('keepStoredTokenFresh', () => {
  beforeEach(() => {
    ;(getSession as jest.Mock).mockResolvedValue(storedSession)
    ;(saveSession as jest.Mock).mockClear()
  })

  it('stores the refreshed access token next to the session it belongs to', async () => {
    const fake = makeClient({
      accessToken: 'new-access',
      refreshToken: 'refresh-1',
      tokenType: 'bearer',
      scope: 'io.cozy.files'
    })
    keepStoredTokenFresh(fake.client)

    fake.refresh()
    await new Promise(process.nextTick)

    expect(saveSession).toHaveBeenCalledWith({
      ...storedSession,
      token: { ...storedSession.token, accessToken: 'new-access' }
    })
  })

  it('keeps the stored refresh token when the stack returns none', async () => {
    const fake = makeClient({ accessToken: 'new-access', refreshToken: '' })
    keepStoredTokenFresh(fake.client)

    fake.refresh()
    await new Promise(process.nextTick)

    expect(saveSession).toHaveBeenCalledWith(
      expect.objectContaining({
        token: expect.objectContaining({ refreshToken: 'refresh-1', accessToken: 'new-access' })
      })
    )
  })

  it('writes nothing when the token has not moved', async () => {
    const fake = makeClient({ ...storedSession.token })
    keepStoredTokenFresh(fake.client)

    fake.refresh()
    await new Promise(process.nextTick)

    expect(saveSession).not.toHaveBeenCalled()
  })

  it('writes nothing when no session is stored', async () => {
    ;(getSession as jest.Mock).mockResolvedValue(null)
    const fake = makeClient({ accessToken: 'new-access' })
    keepStoredTokenFresh(fake.client)

    fake.refresh()
    await new Promise(process.nextTick)

    expect(saveSession).not.toHaveBeenCalled()
  })

  it('stops listening once released', () => {
    const fake = makeClient({ accessToken: 'new-access' })
    const stop = keepStoredTokenFresh(fake.client)
    expect(fake.listeners).toBe(1)
    stop()
    expect(fake.listeners).toBe(0)
  })
})
