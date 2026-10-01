jest.mock('cozy-pouch-link', () => {
  return jest.fn().mockImplementation(function (this: any, opts: unknown) {
    this.options = opts
    this.name = 'pouch'
  })
})

jest.mock('@/pouchdb/platformReactNative', () => ({
  platformReactNative: { pouchAdapter: 'POUCH_ADAPTER_SENTINEL' }
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  default: jest.fn(function (this: any, opts: unknown) {
    this.options = opts
    this.registerPlugin = jest.fn().mockResolvedValue(undefined)
    this.login = jest.fn().mockResolvedValue(undefined)
    this.on = jest.fn()
    this.removeListener = jest.fn()
    this.getStackClient = jest.fn().mockReturnValue({ token: null })
  }),
  StackLink: jest.fn().mockImplementation(function (this: any) {
    this.name = 'stack'
  })
}))

jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: { plugin: 'flag-plugin' }
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

jest.mock('@/search/searchDatabases', () => ({
  ensureAllFileNameIndexes: jest.fn(async () => undefined),
  setReplicating: jest.fn()
}))

import CozyClient from 'cozy-client'
import PouchLink from 'cozy-pouch-link'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { ensureAllFileNameIndexes, setReplicating } from '@/search/searchDatabases'
import { createClient } from './createClient'

const mockCozyClient = CozyClient as unknown as jest.Mock

const session = {
  uri: 'https://alice.example.com',
  oauthOptions: { clientID: 'cid', clientName: 'twake' },
  token: { accessToken: 'tok' }
} as never

describe('createClient', () => {
  beforeEach(() => {
    mockCozyClient.mockClear()
    ;(PouchLink as unknown as jest.Mock).mockClear()
    ;(triggerPouchReplication as jest.Mock).mockClear()
    ;(ensureAllFileNameIndexes as jest.Mock).mockClear()
    ;(setReplicating as jest.Mock).mockClear()
  })

  it('instantiates CozyClient with the session uri + oauth opts', async () => {
    await createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    expect(opts.uri).toBe('https://alice.example.com')
    expect(opts.oauth).toMatchObject({ clientID: 'cid', token: { accessToken: 'tok' } })
  })

  it('passes a links array containing PouchLink + StackLink', async () => {
    await createClient(session)
    const opts = mockCozyClient.mock.calls[0][0] as Record<string, unknown>
    const links = opts.links as unknown[]
    expect(Array.isArray(links)).toBe(true)
    expect(links).toHaveLength(2)
    expect(PouchLink as unknown as jest.Mock).toHaveBeenCalledTimes(1)
  })

  it('registers the cozy-flags plugin', async () => {
    const client = (await createClient(session)) as unknown as { registerPlugin: jest.Mock }
    expect(client.registerPlugin).toHaveBeenCalledWith('flag-plugin', null)
  })

  it('calls client.login() after construction so PouchManager initializes', async () => {
    const client = (await createClient(session)) as unknown as { login: jest.Mock }
    expect(client.login).toHaveBeenCalledTimes(1)
    expect(client.login).toHaveBeenCalledWith({
      uri: 'https://alice.example.com',
      token: { accessToken: 'tok' }
    })
  })

  it('triggers an immediate pouch replication after login', async () => {
    await createClient(session)
    expect(triggerPouchReplication).toHaveBeenCalledWith(expect.anything(), undefined, {
      immediate: true
    })
  })

  describe('replication events', () => {
    const emit = (client: { on: jest.Mock }, event: string): void => {
      const listeners = client.on.mock.calls.filter(call => call[0] === event)
      ;(listeners[listeners.length - 1][1] as () => void)()
    }

    it('starts with no replication flagged', async () => {
      await createClient(session)
      expect((setReplicating as jest.Mock).mock.calls).toEqual([[false]])
    })

    it('flags the replication when a sync starts', async () => {
      const client = (await createClient(session)) as unknown as { on: jest.Mock }
      emit(client, 'pouchlink:sync:start')
      expect(setReplicating).toHaveBeenLastCalledWith(true)
      expect(ensureAllFileNameIndexes).not.toHaveBeenCalled()
    })

    it('clears the flag when a sync is stopped', async () => {
      const client = (await createClient(session)) as unknown as { on: jest.Mock }
      emit(client, 'pouchlink:sync:stop')
      expect(setReplicating).toHaveBeenLastCalledWith(false)
      expect(ensureAllFileNameIndexes).not.toHaveBeenCalled()
    })

    it('clears the flag, then ensures every name index, when a sync ends', async () => {
      const client = (await createClient(session)) as unknown as { on: jest.Mock }
      emit(client, 'pouchlink:sync:end')
      expect(setReplicating).toHaveBeenLastCalledWith(false)
      expect(ensureAllFileNameIndexes).toHaveBeenCalledWith(client)
      expect((setReplicating as jest.Mock).mock.invocationCallOrder[0]).toBeLessThan(
        (ensureAllFileNameIndexes as jest.Mock).mock.invocationCallOrder[0]
      )
    })

    it('registers each search listener once', async () => {
      const client = (await createClient(session)) as unknown as { on: jest.Mock }
      const events = client.on.mock.calls.map(call => call[0] as string)
      expect(events.filter(event => event === 'pouchlink:sync:start')).toHaveLength(1)
      expect(events.filter(event => event === 'pouchlink:sync:stop')).toHaveLength(1)
    })
  })
})
