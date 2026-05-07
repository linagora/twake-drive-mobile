import {
  absoluteMemberIndex,
  addRecipient,
  buildPublicLinkUrl,
  createPublicLink,
  createSharingForFile,
  findPublicLinkForFile,
  findSharingForFile,
  getRecipients,
  revokePublicLink,
  revokeRecipientAtIndex
} from './sharing'

type CollectionMap = Record<string, Record<string, jest.Mock>>

const makeClient = (collections: CollectionMap) =>
  ({
    collection: (doctype: string) => collections[doctype] ?? {}
  }) as unknown as import('cozy-client').default

describe('findSharingForFile', () => {
  it('returns null when no sharing matches', async () => {
    const findByDoctype = jest.fn().mockResolvedValue({
      data: [
        {
          _id: 's1',
          attributes: { rules: [{ doctype: 'io.cozy.files', values: ['other'] }] }
        }
      ]
    })
    const client = makeClient({ 'io.cozy.sharings': { findByDoctype } })
    const result = await findSharingForFile(client, 'file-1')
    expect(result).toBeNull()
    expect(findByDoctype).toHaveBeenCalledWith('io.cozy.files')
  })

  it('prefers an owner sharing over a recipient sharing', async () => {
    const findByDoctype = jest.fn().mockResolvedValue({
      data: [
        {
          _id: 'guest',
          attributes: {
            rules: [{ doctype: 'io.cozy.files', values: ['file-1'] }],
            owner: false
          }
        },
        {
          _id: 'mine',
          attributes: {
            rules: [{ doctype: 'io.cozy.files', values: ['file-1'] }],
            owner: true
          }
        }
      ]
    })
    const client = makeClient({ 'io.cozy.sharings': { findByDoctype } })
    const result = await findSharingForFile(client, 'file-1')
    expect(result?._id).toBe('mine')
  })

  it('falls back to a non-owner sharing when nothing else matches', async () => {
    const findByDoctype = jest.fn().mockResolvedValue({
      data: [
        {
          _id: 'guest',
          attributes: {
            rules: [{ doctype: 'io.cozy.files', values: ['file-1'] }],
            owner: false
          }
        }
      ]
    })
    const client = makeClient({ 'io.cozy.sharings': { findByDoctype } })
    const result = await findSharingForFile(client, 'file-1')
    expect(result?._id).toBe('guest')
  })

  it('treats rules without a doctype as files-doctype rules', async () => {
    // The stack normalizer sometimes drops `doctype` on rules; make sure we
    // still match those.
    const findByDoctype = jest.fn().mockResolvedValue({
      data: [{ _id: 's1', attributes: { rules: [{ values: ['file-1'] }] } }]
    })
    const client = makeClient({ 'io.cozy.sharings': { findByDoctype } })
    const result = await findSharingForFile(client, 'file-1')
    expect(result?._id).toBe('s1')
  })
})

describe('findPublicLinkForFile', () => {
  it('returns the permission whose values include the fileId', async () => {
    const findLinksByDoctype = jest.fn().mockResolvedValue({
      data: [
        { _id: 'p1', attributes: { permissions: { files: { values: ['other'] } } } },
        {
          _id: 'p2',
          attributes: { permissions: { files: { values: ['file-1'] }, codes: {} } }
        }
      ]
    })
    const client = makeClient({ 'io.cozy.permissions': { findLinksByDoctype } })
    const result = await findPublicLinkForFile(client, 'file-1')
    expect(result?._id).toBe('p2')
  })

  it('returns null when no link matches', async () => {
    const findLinksByDoctype = jest.fn().mockResolvedValue({ data: [] })
    const client = makeClient({ 'io.cozy.permissions': { findLinksByDoctype } })
    const result = await findPublicLinkForFile(client, 'file-1')
    expect(result).toBeNull()
  })
})

describe('buildPublicLinkUrl', () => {
  it('builds a sharecode URL on the drive subdomain', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: { codes: { code: 'XYZCODE' } }
    })
    expect(url).toBe(
      'https://alice-drive.cozy.example/public?sharecode=XYZCODE&id=perm-1'
    )
  })

  it('returns null when there are no codes', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: { codes: {} }
    })
    expect(url).toBeNull()
  })

  it('returns null when stackUri is malformed', () => {
    const url = buildPublicLinkUrl('::not-a-url::', {
      _id: 'perm-1',
      attributes: { codes: { code: 'X' } }
    })
    expect(url).toBeNull()
  })

  it('prefers shortcodes.email over shortcodes.code', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: {
        shortcodes: { code: 'short-code-key', email: 'short-email-key' }
      }
    })
    expect(url).toBe('https://alice-drive.cozy.example/public?sharecode=short-email-key&id=perm-1')
  })

  it('falls back to shortcodes.code when email is absent', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: {
        shortcodes: { code: 'short-code-key' }
      }
    })
    expect(url).toBe('https://alice-drive.cozy.example/public?sharecode=short-code-key&id=perm-1')
  })

  it('falls back to codes.email when shortcodes are missing', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: {
        codes: { code: 'long-code-key', email: 'long-email-key' }
      }
    })
    expect(url).toBe('https://alice-drive.cozy.example/public?sharecode=long-email-key&id=perm-1')
  })

  it('prefers the shortcode over the long sharecode when both are present', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: {
        codes: { code: 'LONGFULLSHARECODE' },
        shortcodes: { code: 'k7Hv2x9p' }
      }
    })
    expect(url).toBe('https://alice-drive.cozy.example/public?sharecode=k7Hv2x9p&id=perm-1')
  })

  it('falls back to the long sharecode when shortcodes are absent', () => {
    const url = buildPublicLinkUrl('https://alice.cozy.example/', {
      _id: 'perm-1',
      attributes: { codes: { code: 'LONGFULLSHARECODE' } }
    })
    expect(url).toBe(
      'https://alice-drive.cozy.example/public?sharecode=LONGFULLSHARECODE&id=perm-1'
    )
  })
})

describe('getRecipients', () => {
  it('returns [] for null input', () => {
    expect(getRecipients(null)).toEqual([])
  })

  it('filters out the owner', () => {
    const sharing = {
      _id: 's1',
      attributes: {
        members: [
          { status: 'owner', email: 'alice@example.com' },
          { status: 'pending', email: 'bob@example.com' },
          { status: 'ready', email: 'carol@example.com' }
        ]
      }
    }
    const recipients = getRecipients(sharing)
    expect(recipients).toHaveLength(2)
    expect(recipients.map(r => r.email)).toEqual(['bob@example.com', 'carol@example.com'])
  })
})

describe('absoluteMemberIndex', () => {
  it('translates a recipient index to a member index', () => {
    const sharing = {
      _id: 's1',
      attributes: {
        members: [
          { status: 'owner' },
          { status: 'pending' },
          { status: 'ready' }
        ]
      }
    }
    expect(absoluteMemberIndex(sharing, 0)).toBe(1)
    expect(absoluteMemberIndex(sharing, 1)).toBe(2)
    expect(absoluteMemberIndex(sharing, 2)).toBe(-1)
  })
})

describe('addRecipient', () => {
  it('places the new contact in `recipients` for read-write', async () => {
    const contactCreate = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'contact-1', _type: 'io.cozy.contacts' } })
    const addRecipients = jest.fn().mockResolvedValue({ data: {} })
    const client = makeClient({
      'io.cozy.contacts': { create: contactCreate },
      'io.cozy.sharings': { addRecipients }
    })
    await addRecipient(
      client,
      { _id: 'sharing-1' } as Parameters<typeof addRecipient>[1],
      'bob@example.com',
      false
    )
    expect(contactCreate).toHaveBeenCalledWith({
      email: [{ address: 'bob@example.com', primary: true }]
    })
    expect(addRecipients).toHaveBeenCalledWith({
      document: { _id: 'sharing-1' },
      recipients: [{ _id: 'contact-1', _type: 'io.cozy.contacts' }],
      readOnlyRecipients: []
    })
  })

  it('places the new contact in `readOnlyRecipients` when read-only', async () => {
    const contactCreate = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'contact-2', _type: 'io.cozy.contacts' } })
    const addRecipients = jest.fn().mockResolvedValue({ data: {} })
    const client = makeClient({
      'io.cozy.contacts': { create: contactCreate },
      'io.cozy.sharings': { addRecipients }
    })
    await addRecipient(
      client,
      { _id: 'sharing-1' } as Parameters<typeof addRecipient>[1],
      'bob@example.com',
      true
    )
    expect(addRecipients).toHaveBeenCalledWith({
      document: { _id: 'sharing-1' },
      recipients: [],
      readOnlyRecipients: [{ _id: 'contact-2', _type: 'io.cozy.contacts' }]
    })
  })
})

describe('revokeRecipientAtIndex', () => {
  it('passes the sharing id and index to revokeRecipient', async () => {
    const revokeRecipient = jest.fn().mockResolvedValue({})
    const client = makeClient({ 'io.cozy.sharings': { revokeRecipient } })
    await revokeRecipientAtIndex(
      client,
      { _id: 'sharing-1' } as Parameters<typeof revokeRecipientAtIndex>[1],
      2
    )
    expect(revokeRecipient).toHaveBeenCalledWith({ _id: 'sharing-1' }, 2)
  })
})

describe('createPublicLink', () => {
  it('calls createSharingLink with the file as a doc reference and tiny:true to request a shortcode', async () => {
    const createSharingLink = jest.fn().mockResolvedValue({ data: { _id: 'p1' } })
    const client = makeClient({ 'io.cozy.permissions': { createSharingLink } })
    await createPublicLink(client, { _id: 'file-1', type: 'file' })
    expect(createSharingLink).toHaveBeenCalledWith(
      { _id: 'file-1', _type: 'io.cozy.files', type: 'file' },
      { tiny: true }
    )
  })
})

describe('revokePublicLink', () => {
  it('calls revokeSharingLink with the file as a doc reference', async () => {
    const revokeSharingLink = jest.fn().mockResolvedValue(undefined)
    const client = makeClient({ 'io.cozy.permissions': { revokeSharingLink } })
    await revokePublicLink(client, { _id: 'file-1', type: 'directory' })
    expect(revokeSharingLink).toHaveBeenCalledWith({
      _id: 'file-1',
      _type: 'io.cozy.files',
      type: 'directory'
    })
  })
})

describe('createSharingForFile', () => {
  it('creates the contact and the sharing with description = file name', async () => {
    const contactCreate = jest
      .fn()
      .mockResolvedValue({ data: { _id: 'contact-1', _type: 'io.cozy.contacts' } })
    const create = jest.fn().mockResolvedValue({ data: { _id: 'sharing-1' } })
    const client = makeClient({
      'io.cozy.contacts': { create: contactCreate },
      'io.cozy.sharings': { create }
    })
    await createSharingForFile(
      client,
      { _id: 'file-1', name: 'Doc.pdf', type: 'file' },
      'bob@example.com',
      false
    )
    expect(create).toHaveBeenCalledWith({
      document: {
        _id: 'file-1',
        _type: 'io.cozy.files',
        name: 'Doc.pdf',
        type: 'file'
      },
      description: 'Doc.pdf',
      recipients: [{ _id: 'contact-1', _type: 'io.cozy.contacts' }],
      readOnlyRecipients: []
    })
  })
})
