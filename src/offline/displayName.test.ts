import { offlineDisplayName } from './displayName'

describe('offlineDisplayName', () => {
  const entry = { fileId: 'f1', name: 'ancien nom.eml' }

  it('shows the name the document carries, not the one stored at pin time', () => {
    expect(offlineDisplayName(entry, 'test après switch.eml')).toBe('test après switch.eml')
  })

  it('falls back to the stored name for a file the app no longer knows', () => {
    expect(offlineDisplayName(entry)).toBe('ancien nom.eml')
  })

  it('falls back to the id when there is no name at all', () => {
    expect(offlineDisplayName({ fileId: 'f1' })).toBe('f1')
  })

  it('composes an accent written as a letter and a combining mark', () => {
    const decomposed = 'test après switch.eml'
    expect(offlineDisplayName(entry, decomposed)).toBe('test après switch.eml')
    expect(offlineDisplayName({ fileId: 'f1', name: decomposed })).toBe('test après switch.eml')
  })
})
