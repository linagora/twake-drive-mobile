import { optimisticCreated } from './optimisticCreated'

const now = (): string => '2026-09-22T08:00:00.000Z'

describe('optimisticCreated', () => {
  it('carries a date, so a list sorted by date shows the new row at once', () => {
    const doc = optimisticCreated({ _id: 'abc', name: 'Rapports' }, 'dir-1', 'directory', now)
    expect(doc.updated_at).toBe(now())
    expect(doc.created_at).toBe(now())
  })

  it('keeps the dates the stack answered with', () => {
    const doc = optimisticCreated(
      { _id: 'abc', name: 'Rapports', updated_at: '2026-01-02T03:04:05Z' },
      'dir-1',
      'directory',
      now
    )
    expect(doc.updated_at).toBe('2026-01-02T03:04:05Z')
  })

  it('names the folder it was created in, and its type', () => {
    const doc = optimisticCreated({ _id: 'abc', name: 'Notes' }, 'dir-1', 'file', now)
    expect(doc).toMatchObject({ dir_id: 'dir-1', type: 'file', _type: 'io.cozy.files' })
  })

  it('answers an empty name rather than undefined, which a sort on name drops', () => {
    const doc = optimisticCreated({ _id: 'abc', name: null }, 'dir-1', 'file', now)
    expect(doc.name).toBe('')
  })
})
