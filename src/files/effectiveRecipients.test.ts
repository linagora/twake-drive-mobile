import {
  EffectiveRecipient,
  bestSource,
  fetchEffectiveRecipients,
  toRecipientViews
} from './effectiveRecipients'

const makeClient = (fetchEffective: jest.Mock) =>
  ({
    collection: () => ({ fetchEffectiveRecipients: fetchEffective })
  }) as unknown as import('cozy-client').default

const withSources = (sources: EffectiveRecipient['sources']): EffectiveRecipient => ({
  name: 'Ada',
  email: 'ada@example.org',
  status: 'ready',
  sources
})

describe('bestSource', () => {
  it('prefers the document own share over an inherited one', () => {
    const recipient = withSources([
      { sharing_id: 'parent', member_index: 3, kind: 'ancestor' },
      { sharing_id: 'self', member_index: 1, kind: 'self' }
    ])
    expect(bestSource(recipient)?.sharing_id).toBe('self')
  })

  it('falls back to the first source when none is the own share', () => {
    const recipient = withSources([
      { sharing_id: 'grand-parent', member_index: 2, kind: 'ancestor' },
      { sharing_id: 'parent', member_index: 5, kind: 'ancestor' }
    ])
    expect(bestSource(recipient)?.sharing_id).toBe('grand-parent')
  })

  it('returns null when the recipient has no source', () => {
    expect(bestSource({ email: 'ada@example.org' })).toBeNull()
    expect(bestSource(withSources([]))).toBeNull()
  })
})

describe('toRecipientViews', () => {
  it('targets the sharing and member index of the best source', () => {
    const views = toRecipientViews([
      withSources([
        { sharing_id: 'parent', member_index: 4, kind: 'ancestor' },
        { sharing_id: 'own', member_index: 2, kind: 'self' }
      ])
    ])
    expect(views).toHaveLength(1)
    expect(views[0].sharingId).toBe('own')
    expect(views[0].memberIndex).toBe(2)
    expect(views[0].key).toBe('own-2')
  })

  it('names the folder an inherited access comes from', () => {
    const views = toRecipientViews([
      withSources([{ sharing_id: 'parent', member_index: 1, kind: 'ancestor', root_name: 'Team' }])
    ])
    expect(views[0].inheritedFrom).toBe('Team')
  })

  it('leaves inheritedFrom out for the document own share', () => {
    const views = toRecipientViews([
      withSources([{ sharing_id: 'own', member_index: 1, kind: 'self', root_name: 'Team' }])
    ])
    expect(views[0].inheritedFrom).toBeUndefined()
  })

  it('reports a source the stack says cannot be managed here', () => {
    const views = toRecipientViews([
      withSources([{ sharing_id: 'parent', member_index: 1, kind: 'ancestor', manageable: false }])
    ])
    expect(views[0].manageable).toBe(false)
  })

  it('keeps a sourceless recipient but offers no action on it', () => {
    const views = toRecipientViews([{ email: 'ada@example.org', status: 'pending' }])
    expect(views).toHaveLength(1)
    expect(views[0].manageable).toBe(false)
    expect(views[0].sharingId).toBeUndefined()
    expect(views[0].memberIndex).toBeUndefined()
  })

  it('drops the owner', () => {
    const views = toRecipientViews([
      { email: 'me@example.org', status: 'owner' },
      withSources([{ sharing_id: 'own', member_index: 1, kind: 'self' }])
    ])
    expect(views).toHaveLength(1)
    expect(views[0].email).toBe('ada@example.org')
  })

  it('carries the read-only flag through', () => {
    const views = toRecipientViews([
      { ...withSources([{ sharing_id: 'own', member_index: 1 }]), read_only: true }
    ])
    expect(views[0].readOnly).toBe(true)
  })

  it('answers an empty list when the stack answered nothing', () => {
    expect(toRecipientViews(undefined)).toEqual([])
    expect(toRecipientViews(null)).toEqual([])
  })
})

describe('fetchEffectiveRecipients', () => {
  it('asks for the document own recipients when it is not in a drive', async () => {
    const fetchEffective = jest.fn().mockResolvedValue({ data: [] })
    await fetchEffectiveRecipients(makeClient(fetchEffective), 'file-1')
    expect(fetchEffective).toHaveBeenCalledWith('file-1', {})
  })

  it('scopes the call to the drive the document lives in', async () => {
    const fetchEffective = jest.fn().mockResolvedValue({ data: [] })
    await fetchEffectiveRecipients(makeClient(fetchEffective), 'file-1', 'drive-1')
    expect(fetchEffective).toHaveBeenCalledWith('file-1', { driveId: 'drive-1' })
  })

  it('maps what the stack answered', async () => {
    const fetchEffective = jest.fn().mockResolvedValue({
      data: [withSources([{ sharing_id: 'own', member_index: 2, kind: 'self' }])]
    })
    const views = await fetchEffectiveRecipients(makeClient(fetchEffective), 'file-1')
    expect(views).toEqual([
      {
        key: 'own-2',
        name: 'Ada',
        email: 'ada@example.org',
        instance: undefined,
        status: 'ready',
        readOnly: false,
        sharingId: 'own',
        memberIndex: 2,
        manageable: true,
        inheritedFrom: undefined
      }
    ])
  })
})
