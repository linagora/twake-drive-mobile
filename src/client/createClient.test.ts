// Note: jest.mock is hoisted above imports by babel-plugin-jest-hoist.
// Variables referenced inside the factory must either be declared with
// `mock`-prefixed names (so the plugin allows the reference) or be
// fully self-contained. Here we use self-contained factories and then
// retrieve the mocks via jest.mocked() / direct require to inspect calls.

jest.mock('cozy-pouch-link', () => ({
  __esModule: true,
  default: jest.fn(function (this: any, opts: unknown) {
    this.options = opts
  }),
  SQLiteQuery: class {}
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn(function (this: any, opts: unknown) {
    this.options = opts
    this.registerPlugin = jest.fn().mockResolvedValue(undefined)
    this.login = jest.fn().mockResolvedValue(undefined)
  }),
  StackLink: jest.fn(function (this: any) {
    this.kind = 'StackLink-stub'
  })
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: { plugin: 'flag-plugin' }
}))

jest.mock('./pouchPlatform', () => ({ pouchPlatform: 'pouchPlatformStub' }))

import CozyPouchLink from 'cozy-pouch-link'
import CozyClient from 'cozy-client'
import { createClient, pouchLink } from './createClient'

const mockPouchLinkCtor = CozyPouchLink as unknown as jest.Mock
const mockCozyClient = CozyClient as unknown as jest.Mock

const session = {
  uri: 'https://alice.example.com',
  oauthOptions: { clientID: 'cid', clientName: 'twake' },
  token: { accessToken: 'tok' }
} as never

describe('createClient', () => {
  it('exports a CozyPouchLink singleton configured with the right doctypes and strategy', () => {
    expect(mockPouchLinkCtor).toHaveBeenCalled()
    const opts = mockPouchLinkCtor.mock.calls[0][0] as Record<string, unknown>
    expect(opts.doctypes).toEqual(['io.cozy.files', 'io.cozy.sharings'])
    expect(opts.doctypesReplicationOptions).toEqual({
      'io.cozy.files': { strategy: 'fromRemote' },
      'io.cozy.sharings': { strategy: 'fromRemote' }
    })
    expect(opts.platform).toBe('pouchPlatformStub')
    expect(pouchLink).toBeDefined()
  })

  it('passes [pouchLink, StackLink] as the chain (pouch first, stack fallback)', () => {
    createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    expect(Array.isArray(opts.links)).toBe(true)
    expect((opts.links as unknown[]).length).toBe(2)
    expect((opts.links as unknown[])[0]).toBe(pouchLink)
    // The second link is the StackLink instance — cozy-client v60 does NOT
    // auto-append it when `links` is provided, so we add it explicitly.
    expect((opts.links as unknown[])[1]).toMatchObject({ kind: 'StackLink-stub' })
    expect(opts.uri).toBe('https://alice.example.com')
  })
})
