import { SharingDoc } from '@/files/sharing'
import { FileSharingEntry } from './SharingProvider'
import {
  canLeave,
  canReshare,
  hasWriteAccess,
  sharedDriveSharingType,
  sharingTypeFor
} from './writeAccess'

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

describe('canReshare', () => {
  const member = (read_only: boolean) => ({ status: 'ready', instance: ME, read_only })

  it('is open to a member who may write, on a sharing that allows resharing', () => {
    const s = sharing({ open_sharing: true, members: [member(false)] })
    expect(canReshare(state([s], [['f1', { sharing: s }]]), 'f1', ME)).toBe(true)
  })

  it('is closed on a sharing that does not allow resharing', () => {
    const s = sharing({ open_sharing: false, members: [member(false)] })
    expect(canReshare(state([s], [['f1', { sharing: s }]]), 'f1', ME)).toBe(false)
  })

  it('is closed to a read-only member', () => {
    const s = sharing({ open_sharing: true, members: [member(true)] })
    expect(canReshare(state([s], [['f1', { sharing: s }]]), 'f1', ME)).toBe(false)
  })

  it('is closed when the instance is not a member', () => {
    const s = sharing({ open_sharing: true, members: [] })
    expect(canReshare(state([s], [['f1', { sharing: s }]]), 'f1', ME)).toBe(false)
  })

  it('follows the member alone on a shared drive, unless an organisation owns it', () => {
    const drive = sharing({ drive: true, members: [member(false)] })
    const orgDrive = sharing({ drive: true, org_drive: true, members: [member(false)] })
    expect(canReshare(state([drive], [['f1', { sharing: drive }]]), 'f1', ME)).toBe(true)
    expect(canReshare(state([orgDrive], [['f1', { sharing: orgDrive }]]), 'f1', ME)).toBe(false)
  })

  it('is closed for a document nobody shared', () => {
    expect(canReshare(state([]), 'f1', ME)).toBe(false)
  })
})

describe('canLeave', () => {
  it('is open on any sharing but the drive of an organisation', () => {
    const plain = sharing({})
    const org = sharing({ drive: true, org_drive: true })
    expect(canLeave(state([plain], [['f1', { sharing: plain }]]), 'f1')).toBe(true)
    expect(canLeave(state([org], [['f1', { sharing: org }]]), 'f1')).toBe(false)
  })

  it('is closed for a document nobody shared', () => {
    expect(canLeave(state([]), 'f1')).toBe(false)
  })
})
