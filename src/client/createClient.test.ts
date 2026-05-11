jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn(function (this: any, opts: unknown) {
    this.options = opts
    this.registerPlugin = jest.fn().mockResolvedValue(undefined)
  })
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: { plugin: 'flag-plugin' }
}))

import CozyClient from 'cozy-client'
import { createClient } from './createClient'

const mockCozyClient = CozyClient as unknown as jest.Mock

const session = {
  uri: 'https://alice.example.com',
  oauthOptions: { clientID: 'cid', clientName: 'twake' },
  token: { accessToken: 'tok' }
} as never

describe('createClient', () => {
  beforeEach(() => mockCozyClient.mockClear())

  it('instantiates CozyClient with the session uri + oauth opts', () => {
    createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    expect(opts.uri).toBe('https://alice.example.com')
    expect(opts.oauth).toMatchObject({ clientID: 'cid', token: { accessToken: 'tok' } })
  })

  it('does NOT pass a `links` array — the default StackLink chain is enough', () => {
    createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    expect(opts.links).toBeUndefined()
  })

  it('registers the cozy-flags plugin', () => {
    const client = createClient(session) as unknown as { registerPlugin: jest.Mock }
    expect(client.registerPlugin).toHaveBeenCalledWith('flag-plugin', null)
  })
})
