jest.mock('cozy-pouch-link', () => {
  return jest.fn().mockImplementation(function (this: any, opts: unknown) {
    this.options = opts
  })
})
jest.mock('@/pouchdb/platformReactNative', () => ({
  platformReactNative: { pouchAdapter: 'POUCH_ADAPTER_SENTINEL' }
}))

import PouchLink from 'cozy-pouch-link'
import { getLinks, offlineDoctypes } from './getLinks'

describe('getLinks', () => {
  beforeEach(() => (PouchLink as unknown as jest.Mock).mockClear())

  it('returns [PouchLink, StackLink] in that order', () => {
    const links = getLinks()
    expect(links).toHaveLength(2)
    expect(PouchLink as unknown as jest.Mock).toHaveBeenCalledTimes(1)
  })

  it('passes platformReactNative.pouchAdapter to PouchLink (not pouchdb-browser)', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    expect(opts.platform.pouchAdapter).toBe('POUCH_ADAPTER_SENTINEL')
  })

  it('replicates every offlineDoctype with strategy=fromRemote', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    for (const dt of offlineDoctypes) {
      // Each doctype also carries warmupQueries (gate + files indexes); assert
      // the replication strategy without pinning the exact object shape.
      expect(opts.doctypesReplicationOptions[dt].strategy).toBe('fromRemote')
    }
  })

  it('targets exactly the offline doctypes (files, contacts, settings)', () => {
    // sharings/permissions/notes were dropped (online-only; their initial
    // replication hangs on fetchRemoteLastSequence) — see getLinks.ts.
    // settings is in: without it the whole link chain fails offline.
    expect(offlineDoctypes).toEqual(['io.cozy.files', 'io.cozy.contacts', 'io.cozy.settings'])
  })

  it('enables periodic sync with a 30 second interval', () => {
    getLinks()
    const opts = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
    expect(opts.periodicSync).toBe(true)
    expect(opts.replicationInterval).toBe(30_000)
  })
})

describe('a client rebuilt after a shared drive was registered', () => {
  beforeEach(() => (PouchLink as unknown as jest.Mock).mockClear())

  it('hands the link its own copy of the replication options', () => {
    const first = getLinks()
    const firstOptions = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
      .doctypesReplicationOptions as Record<string, unknown>
    // What cozy-pouch-link does when a drive is opened: it writes the new
    // doctype into the object it was handed.
    firstOptions['io.cozy.files.shareddrives-drive-1'] = {
      strategy: 'fromRemote',
      driveId: 'drive-1'
    }
    expect(first).toHaveLength(2)

    getLinks()
    const secondOptions = (PouchLink as unknown as jest.Mock).mock.calls[1][0]
      .doctypesReplicationOptions as Record<string, unknown>
    expect(secondOptions['io.cozy.files.shareddrives-drive-1']).toBeUndefined()
  })

  it('builds the links rather than throw on a doctype with no warmup queries', () => {
    getLinks()
    const handed = (PouchLink as unknown as jest.Mock).mock.calls[0][0]
      .doctypesReplicationOptions as Record<string, unknown>
    handed['io.cozy.files.shareddrives-drive-2'] = { strategy: 'fromRemote', driveId: 'drive-2' }
    expect(() => getLinks()).not.toThrow()
  })
})
