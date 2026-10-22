import { compareNames, sortFileList } from './sortFileList'

const folder = (name: string, updated_at?: string) => ({
  name,
  type: 'directory' as const,
  updated_at
})
const file = (name: string, updated_at?: string) => ({ name, type: 'file' as const, updated_at })
const names = (items: { name: string }[]) => items.map(item => item.name)

describe('compareNames', () => {
  it('reads names as a person does: case and accents aside', () => {
    expect(['Zoo', 'été', 'Alpha', 'beta'].map(name => ({ name })).sort(compareNames)).toEqual(
      ['Alpha', 'beta', 'été', 'Zoo'].map(name => ({ name }))
    )
  })
})

describe('sortFileList', () => {
  const items = [
    file('zeta.txt', '2026-01-03'),
    folder('Photos', '2026-01-01'),
    file('Écrit.txt', '2026-01-02'),
    folder('Été 2026', '2026-01-04')
  ]

  it('lists the folders first, each group by name, by default', () => {
    expect(names(sortFileList(items))).toEqual(['Été 2026', 'Photos', 'Écrit.txt', 'zeta.txt'])
  })

  it('reverses the names in each group when asked', () => {
    expect(names(sortFileList(items, { attr: 'name', dir: 'desc' }))).toEqual([
      'Photos',
      'Été 2026',
      'zeta.txt',
      'Écrit.txt'
    ])
  })

  it('orders each group by date in the direction asked', () => {
    expect(names(sortFileList(items, { attr: 'updated_at', dir: 'desc' }))).toEqual([
      'Été 2026',
      'Photos',
      'zeta.txt',
      'Écrit.txt'
    ])
  })

  it('leaves the list it is given untouched', () => {
    const before = names(items)
    sortFileList(items)
    expect(names(items)).toEqual(before)
  })
})
