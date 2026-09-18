import { FileSharingEntry } from './SharingProvider'
import { sharedFileLastUpdatedAt } from './lastUpdatedAt'

const entry = (over: Partial<FileSharingEntry>): FileSharingEntry => ({
  isOwner: false,
  hasLink: false,
  recipients: [],
  ...over
})

describe('sharedFileLastUpdatedAt', () => {
  it('takes the document date when nothing else is newer', () => {
    expect(sharedFileLastUpdatedAt({ updated_at: '2026-05-01T00:00:00Z' })).toBe(
      '2026-05-01T00:00:00Z'
    )
  })

  it('falls back to the created date', () => {
    expect(sharedFileLastUpdatedAt({ created_at: '2026-05-01T00:00:00Z' })).toBe(
      '2026-05-01T00:00:00Z'
    )
  })

  it('prefers the sharing activity when it is newer than the document', () => {
    const date = sharedFileLastUpdatedAt(
      { updated_at: '2026-01-01T00:00:00Z' },
      entry({
        sharing: {
          _id: 's1',
          attributes: { updated_at: '2026-09-01T00:00:00Z' }
        }
      })
    )
    expect(date).toBe('2026-09-01T00:00:00Z')
  })

  it('counts the activity on a share by link too', () => {
    const date = sharedFileLastUpdatedAt(
      { updated_at: '2026-01-01T00:00:00Z' },
      entry({ hasLink: true, linkPermission: { _id: 'p1', updated_at: '2026-07-01T00:00:00Z' } })
    )
    expect(date).toBe('2026-07-01T00:00:00Z')
  })

  it('has no date to give when neither the document nor the sharing has one', () => {
    expect(sharedFileLastUpdatedAt({}, entry({}))).toBeUndefined()
  })
})
