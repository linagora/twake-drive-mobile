import React from 'react'
import { Text } from 'react-native'
import { act, render, waitFor } from '@testing-library/react-native'

let mockClient: unknown = null
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockClient
}))
let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

import { PublicLinkPermission, SharingDoc } from '@/files/sharing'
import {
  buildByIdMap,
  entryToStatus,
  SharingProvider,
  useFileSharingStatus,
  useRefreshSharings
} from './SharingProvider'

const sharing = (overrides: Partial<SharingDoc['attributes']>, id = 's1'): SharingDoc => ({
  _id: id,
  attributes: {
    active: true,
    rules: [],
    members: [],
    owner: false,
    ...overrides
  }
})

const link = (values: string[], id = 'p1', key = 'rule0'): PublicLinkPermission => ({
  _id: id,
  attributes: {
    permissions: { [key]: { type: 'io.cozy.files', values } }
  }
})

describe('buildByIdMap', () => {
  it('returns an empty map when there are no sharings or permissions', () => {
    expect(buildByIdMap([], []).size).toBe(0)
  })

  it('skips sharings flagged as inactive', () => {
    const s = sharing({
      active: false,
      rules: [{ doctype: 'io.cozy.files', values: ['file-a'] }]
    })
    expect(buildByIdMap([s], []).size).toBe(0)
  })

  it('indexes the shortcut of a sharing next to its rule values', () => {
    const s = sharing({
      shortcut_id: 'shortcut-a',
      rules: [{ doctype: 'io.cozy.files', values: ['file-a'] }]
    })
    const map = buildByIdMap([s], [])
    expect(Array.from(map.keys()).sort()).toEqual(['file-a', 'shortcut-a'])
    expect(map.get('shortcut-a')!.isOwner).toBe(false)
    expect(map.get('shortcut-a')!.sharing?._id).toBe('s1')
  })

  // A share that was not accepted yet is inactive, and its rule values are the
  // owner's ids: the shortcut is the only document to list for it.
  it('keeps the shortcut of an inactive sharing, and nothing else of it', () => {
    const s = sharing({
      active: false,
      shortcut_id: 'shortcut-a',
      rules: [{ doctype: 'io.cozy.files', values: ['file-a'] }]
    })
    expect(Array.from(buildByIdMap([s], []).keys())).toEqual(['shortcut-a'])
  })

  it('reads the shortcut from the flattened (non-attributes) shape', () => {
    const s: SharingDoc = { _id: 's-flat', shortcut_id: 'shortcut-flat', owner: false }
    expect(buildByIdMap([s], []).has('shortcut-flat')).toBe(true)
  })

  it('maps a file to a sharing entry with owner and recipients', () => {
    const s = sharing({
      owner: true,
      rules: [{ doctype: 'io.cozy.files', values: ['file-a', 'file-b'] }],
      members: [
        { status: 'owner', email: 'me@cozy' },
        { status: 'ready', email: 'alice@x' },
        { status: 'pending', email: 'bob@x' }
      ]
    })
    const map = buildByIdMap([s], [])
    expect(map.size).toBe(2)

    const entryA = map.get('file-a')!
    expect(entryA.isOwner).toBe(true)
    expect(entryA.hasLink).toBe(false)
    expect(entryA.recipients.map(r => r.email)).toEqual(['alice@x', 'bob@x'])
    expect(entryA.sharing?._id).toBe('s1')
  })

  it('also reads rules/members from the flattened (non-attributes) shape', () => {
    const s: SharingDoc = {
      _id: 's-flat',
      rules: [{ doctype: 'io.cozy.files', values: ['file-flat'] }],
      members: [{ status: 'owner' }, { status: 'ready', email: 'flat@x' }],
      owner: false
    }
    const entry = buildByIdMap([s], []).get('file-flat')!
    expect(entry.recipients).toHaveLength(1)
    expect(entry.recipients[0].email).toBe('flat@x')
  })

  it('flags hasLink=true when a file appears in a public-link permission', () => {
    const p = link(['file-c'])
    const entry = buildByIdMap([], [p]).get('file-c')!
    expect(entry.hasLink).toBe(true)
    expect(entry.sharing).toBeUndefined()
    expect(entry.isOwner).toBe(true)
  })

  it('combines sharing and link entries for the same file', () => {
    const s = sharing({
      rules: [{ doctype: 'io.cozy.files', values: ['file-d'] }],
      owner: true,
      members: [{ status: 'owner' }, { status: 'ready', email: 'r@x' }]
    })
    const p = link(['file-d'])
    const entry = buildByIdMap([s], [p]).get('file-d')!
    expect(entry.isOwner).toBe(true)
    expect(entry.hasLink).toBe(true)
    expect(entry.recipients).toHaveLength(1)
  })

  it('promotes isOwner if any active sharing for the file owns it', () => {
    const a = sharing(
      { rules: [{ doctype: 'io.cozy.files', values: ['file-e'] }], owner: false },
      's-a'
    )
    const b = sharing(
      { rules: [{ doctype: 'io.cozy.files', values: ['file-e'] }], owner: true },
      's-b'
    )
    const entry = buildByIdMap([a, b], []).get('file-e')!
    expect(entry.isOwner).toBe(true)
  })

  it('ignores rules whose doctype is not io.cozy.files', () => {
    const s = sharing({
      rules: [
        { doctype: 'io.cozy.contacts', values: ['contact-x'] },
        { doctype: 'io.cozy.files', values: ['file-f'] }
      ]
    })
    const map = buildByIdMap([s], [])
    expect(map.has('contact-x')).toBe(false)
    expect(map.has('file-f')).toBe(true)
  })
})

describe('entryToStatus', () => {
  it('returns null for an undefined entry', () => {
    expect(entryToStatus(undefined)).toBeNull()
  })

  it('returns null for an entry that has neither a sharing nor a link', () => {
    expect(entryToStatus({ isOwner: false, hasLink: false, recipients: [] })).toBeNull()
  })

  it('projects a sharing-only entry into a status object', () => {
    const s = sharing({ rules: [{ doctype: 'io.cozy.files', values: ['x'] }] })
    const entry = buildByIdMap([s], []).get('x')!
    expect(entryToStatus(entry)).toEqual({
      isShared: true,
      isOwner: false,
      hasLink: false,
      recipientCount: 0
    })
  })

  it('projects a link-only entry into a status object', () => {
    const entry = buildByIdMap([], [link(['y'])]).get('y')!
    expect(entryToStatus(entry)).toEqual({
      isShared: true,
      isOwner: true,
      hasLink: true,
      recipientCount: 0
    })
  })
})

describe('SharingProvider', () => {
  afterEach(() => {
    mockClient = null
    mockOnline = true
  })

  it('loads the sharings again when the network comes back after a failed load', async () => {
    const findByDoctype = jest
      .fn()
      .mockRejectedValueOnce(new Error('Network request failed'))
      .mockResolvedValue({
        data: [sharing({ rules: [{ doctype: 'io.cozy.files', values: ['file-a'] }] })]
      })
    const findLinksByDoctype = jest.fn().mockResolvedValue({ data: [] })
    mockClient = {
      collection: (doctype: string) =>
        doctype === 'io.cozy.sharings' ? { findByDoctype } : { findLinksByDoctype }
    }
    const Badge = () => <Text>{useFileSharingStatus('file-a') ? 'shared' : 'not shared'}</Text>
    const tree = () => (
      <SharingProvider>
        <Badge />
      </SharingProvider>
    )

    const { rerender, findByText } = render(tree())
    await waitFor(() => expect(findByDoctype).toHaveBeenCalledTimes(1))
    expect(await findByText('not shared')).toBeTruthy()

    mockOnline = false
    rerender(tree())
    mockOnline = true
    rerender(tree())
    expect(await findByText('shared')).toBeTruthy()
    expect(findByDoctype).toHaveBeenCalledTimes(2)
  })

  it('does not call the stack while offline and still settles refresh()', async () => {
    mockOnline = false
    const findByDoctype = jest.fn()
    mockClient = { collection: () => ({ findByDoctype, findLinksByDoctype: jest.fn() }) }
    const grabbed: { refresh?: () => Promise<void> } = {}
    const Grab = () => {
      grabbed.refresh = useRefreshSharings()
      return null
    }

    render(
      <SharingProvider>
        <Grab />
      </SharingProvider>
    )

    let refreshed: Promise<void> | undefined
    act(() => {
      refreshed = grabbed.refresh?.()
    })
    await expect(refreshed).resolves.toBeUndefined()
    expect(findByDoctype).not.toHaveBeenCalled()
  })
})
