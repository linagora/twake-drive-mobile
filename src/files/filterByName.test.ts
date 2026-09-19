import { filterByName } from './filterByName'

const docs = [{ name: 'Rapport après congés.pdf' }, { name: 'budget.xlsx' }, { name: 'Photo' }, {}]

describe('filterByName', () => {
  it('keeps everything when nothing is typed', () => {
    expect(filterByName(docs, '   ')).toHaveLength(4)
  })

  it('matches anywhere in the name, ignoring case', () => {
    expect(filterByName(docs, 'BUDG')).toEqual([{ name: 'budget.xlsx' }])
  })

  it('matches an accented name typed without accents', () => {
    expect(filterByName(docs, 'apres')).toEqual([{ name: 'Rapport après congés.pdf' }])
  })

  it('drops a document with no name rather than matching it', () => {
    expect(filterByName(docs, 'o')).not.toContainEqual({})
  })
})
