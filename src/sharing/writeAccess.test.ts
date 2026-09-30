import { SharingDoc } from '@/files/sharing'
import { FileSharingEntry } from './SharingProvider'
import { hasWriteAccess, sharedDriveSharingType, sharingTypeFor } from './writeAccess'

const ME = 'https://alice.mycozy.cloud'

const sharing = (
  attributes: Partial<NonNullable<SharingDoc['attributes']>>,
  id = 's1'
): SharingDoc => ({
  _id: id,
  attributes: { active: true, rules: [], members: [], owner: false, ...attributes }
})

const syncedFolderRule = (values: string[]) => ({
  doctype: 'io.cozy.files',
  values,
  add: 'sync',
  update: 'sync',
  remove: 'sync'
})

const readOnlyRule = (values: string[]) => ({
  doctype: 'io.cozy.files',
  values,
  add: 'push',
  update: 'push',
  remove: 'push'
})

const state = (sharings: SharingDoc[], entries: [string, Partial<FileSharingEntry>][] = []) => ({
  sharings,
  byId: new Map<string, FileSharingEntry>(
    entries.map(([id, e]) => [
      id,
      { isOwner: false, hasLink: false, recipients: [], ...e } as FileSharingEntry
    ])
  )
})

describe('sharingTypeFor', () => {
  it('reads the rule verbs when the instance owns the sharing', () => {
    const s = sharing({ owner: true, rules: [syncedFolderRule(['f1'])] })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('two-way')
  })

  it('is one-way for an owner whose rule does not sync back', () => {
    const s = sharing({ owner: true, rules: [readOnlyRule(['f1'])] })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('one-way')
  })

  it('is one-way when the current member is read_only, whatever the rule says', () => {
    const s = sharing({
      owner: false,
      rules: [syncedFolderRule(['f1'])],
      members: [
        { status: 'owner', instance: 'https://bob.mycozy.cloud' },
        { status: 'ready', instance: ME, read_only: true }
      ]
    })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('one-way')
  })

  it('is two-way for a writable member of a drive sharing', () => {
    const s = sharing({
      owner: false,
      drive: true,
      rules: [readOnlyRule(['f1'])],
      members: [
        { status: 'owner', instance: 'https://bob.mycozy.cloud' },
        { status: 'ready', instance: ME }
      ]
    })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('two-way')
  })

  it('matches the instance case-insensitively', () => {
    const s = sharing({
      owner: false,
      rules: [syncedFolderRule(['f1'])],
      members: [{ status: 'ready', instance: ME.toUpperCase(), read_only: true }]
    })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('one-way')
  })

  it('falls back to the rule verbs when the instance is not a member', () => {
    const s = sharing({ owner: false, rules: [syncedFolderRule(['f1'])], members: [] })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('two-way')
  })

  it('is one-way for a document with no matching rule', () => {
    const s = sharing({ owner: true, rules: [syncedFolderRule(['other'])] })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('one-way')
  })

  it('treats a file rule that revokes on remove as two-way', () => {
    const s = sharing({
      owner: true,
      rules: [{ doctype: 'io.cozy.files', values: ['f1'], update: 'sync', remove: 'revoke' }]
    })
    expect(sharingTypeFor(s, 'f1', ME)).toBe('two-way')
  })
})

describe('sharedDriveSharingType', () => {
  it('is two-way for a member that is not read_only', () => {
    const s = sharing({ members: [{ status: 'ready', instance: ME }] }, 'drive1')
    expect(sharedDriveSharingType(s, ME)).toBe('two-way')
  })

  it('is one-way for a read_only member', () => {
    const s = sharing({ members: [{ status: 'ready', instance: ME, read_only: true }] }, 'drive1')
    expect(sharedDriveSharingType(s, ME)).toBe('one-way')
  })

  it('is null when the instance is not a member of the drive', () => {
    const s = sharing({ members: [{ status: 'owner', instance: 'https://bob.mycozy.cloud' }] })
    expect(sharedDriveSharingType(s, ME)).toBeNull()
  })

  it('is null without a sharing', () => {
    expect(sharedDriveSharingType(undefined, ME)).toBeNull()
  })
})

describe('hasWriteAccess', () => {
  it('allows writing in a folder that is not shared at all', () => {
    expect(hasWriteAccess(state([]), 'f1', undefined, ME)).toBe(true)
  })

  it('allows writing in a folder the instance shared with others', () => {
    const s = sharing({ owner: true, rules: [readOnlyRule(['f1'])] })
    expect(
      hasWriteAccess(state([s], [['f1', { sharing: s, isOwner: true }]]), 'f1', undefined, ME)
    ).toBe(true)
  })

  it('allows writing in a folder shared with the instance in two-way', () => {
    const s = sharing({
      rules: [syncedFolderRule(['f1'])],
      members: [{ status: 'ready', instance: ME }]
    })
    expect(hasWriteAccess(state([s], [['f1', { sharing: s }]]), 'f1', undefined, ME)).toBe(true)
  })

  it('refuses writing in a folder shared with the instance in read only', () => {
    const s = sharing({
      rules: [syncedFolderRule(['f1'])],
      members: [{ status: 'ready', instance: ME, read_only: true }]
    })
    expect(hasWriteAccess(state([s], [['f1', { sharing: s }]]), 'f1', undefined, ME)).toBe(false)
  })

  it('allows writing in a subfolder of a shared folder, which carries no sharing of its own', () => {
    const s = sharing({
      rules: [syncedFolderRule(['f1'])],
      members: [{ status: 'ready', instance: ME, read_only: true }]
    })
    expect(hasWriteAccess(state([s], [['f1', { sharing: s }]]), 'child', undefined, ME)).toBe(true)
  })

  it('allows writing in a shared drive whose member is not read_only', () => {
    const s = sharing({ drive: true, members: [{ status: 'ready', instance: ME }] }, 'drive1')
    expect(hasWriteAccess(state([s]), 'anyFolder', 'drive1', ME)).toBe(true)
  })

  it('refuses writing in a shared drive the instance joined as read_only', () => {
    const s = sharing(
      { drive: true, members: [{ status: 'ready', instance: ME, read_only: true }] },
      'drive1'
    )
    expect(hasWriteAccess(state([s]), 'anyFolder', 'drive1', ME)).toBe(false)
  })

  it('refuses writing in a shared drive that is not in the sharing list yet', () => {
    expect(hasWriteAccess(state([]), 'anyFolder', 'drive1', ME)).toBe(false)
  })

  it('allows a recipient to write at the root folder of a shared drive', () => {
    const drive = sharing({ drive: true, members: [{ status: 'ready', instance: ME }] }, 'drive1')
    expect(
      hasWriteAccess(state([drive], [['root', { sharing: drive }]]), 'root', 'drive1', ME)
    ).toBe(true)
  })

  it('still refuses that root folder when the member joined read only', () => {
    const drive = sharing(
      { drive: true, members: [{ status: 'ready', instance: ME, read_only: true }] },
      'drive1'
    )
    expect(
      hasWriteAccess(state([drive], [['root', { sharing: drive }]]), 'root', 'drive1', ME)
    ).toBe(false)
  })

  it('allows writing in a subfolder of that same drive', () => {
    const drive = sharing({ drive: true, members: [{ status: 'ready', instance: ME }] }, 'drive1')
    expect(
      hasWriteAccess(state([drive], [['root', { sharing: drive }]]), 'child', 'drive1', ME)
    ).toBe(true)
  })

  it('allows writing at the root folder of a drive the instance owns', () => {
    const drive = sharing({ drive: true, members: [{ status: 'ready', instance: ME }] }, 'drive1')
    expect(
      hasWriteAccess(
        state([drive], [['root', { sharing: drive, isOwner: true }]]),
        'root',
        'drive1',
        ME
      )
    ).toBe(true)
  })

  it('ignores the read-only rules of a document once a driveId scopes the write', () => {
    const drive = sharing({ drive: true, members: [{ status: 'ready', instance: ME }] }, 'drive1')
    const doc = sharing({ rules: [readOnlyRule(['f1'])], members: [] }, 's2')
    expect(hasWriteAccess(state([drive, doc]), 'f1', 'drive1', ME)).toBe(true)
  })
})
