import { composeRowLabel } from './rowLabels'

// The real `t` is not needed to prove composition: the labels it returns are
// what gets joined, so a pass-through keeps the assertions readable.
const t = (key: string) => key

describe('composeRowLabel', () => {
  it('joins the parts a screen reader reads as one sentence', () => {
    expect(
      composeRowLabel(t, { name: 'rapport.pdf', kind: 'file', description: '12 ko · hier' })
    ).toBe('rapport.pdf, a11y.row.file, 12 ko · hier')
  })

  it('names the kind so a folder is not mistaken for a file', () => {
    expect(composeRowLabel(t, { name: 'Documents', kind: 'folder' })).toBe(
      'Documents, a11y.row.folder'
    )
  })

  // The shared badge carries no label of its own today, so without this the
  // status is visual only.
  it('mentions that the entry is shared', () => {
    expect(composeRowLabel(t, { name: 'Équipe', kind: 'folder', shared: true })).toBe(
      'Équipe, a11y.row.folder, a11y.row.shared'
    )
  })

  it('mentions the offline state', () => {
    expect(composeRowLabel(t, { name: 'note.md', kind: 'file', offlineState: 'downloaded' })).toBe(
      'note.md, a11y.row.file, a11y.offlineAvailable'
    )
  })

  it('omits the parts that do not apply rather than leaving empty gaps', () => {
    expect(composeRowLabel(t, { name: 'vide.txt', kind: 'file', shared: false })).toBe(
      'vide.txt, a11y.row.file'
    )
  })
})
