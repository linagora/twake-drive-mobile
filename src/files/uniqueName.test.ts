import { generateUniqueNameWithSuffix } from './uniqueName'

describe('generateUniqueNameWithSuffix', () => {
  it('returns the name unchanged when there is no conflict', () => {
    expect(generateUniqueNameWithSuffix('file.txt', new Set(), true)).toBe('file.txt')
  })

  it('inserts (1) before the extension on a file conflict', () => {
    expect(generateUniqueNameWithSuffix('file.txt', new Set(['file.txt']), true)).toBe(
      'file (1).txt'
    )
  })

  it('increments past existing suffixed names', () => {
    expect(
      generateUniqueNameWithSuffix('file.txt', new Set(['file.txt', 'file (1).txt']), true)
    ).toBe('file (2).txt')
  })

  it('continues counting from an already-numbered name', () => {
    expect(
      generateUniqueNameWithSuffix('folder (2)', new Set(['folder (2)', 'folder (3)']), false)
    ).toBe('folder (4)')
  })

  it('treats folders as extensionless (dots are part of the name)', () => {
    expect(generateUniqueNameWithSuffix('my.folder', new Set(['my.folder']), false)).toBe(
      'my.folder (1)'
    )
  })
})
