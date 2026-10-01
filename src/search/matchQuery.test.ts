import { buildMatchQuery } from './matchQuery'

describe('buildMatchQuery', () => {
  it('matches a word as a prefix or as a suffix', () => {
    expect(buildMatchQuery('twake')).toBe('(name:"twake"* OR reversed:"ekawt"*)')
  })

  it('requires every word', () => {
    expect(buildMatchQuery('twake 2026')).toBe(
      '(name:"twake"* OR reversed:"ekawt"*) AND (name:"2026"* OR reversed:"6202"*)'
    )
  })

  it('splits on punctuation like the tokenizer does', () => {
    expect(buildMatchQuery('twake_2026.pdf')).toBe(
      '(name:"twake"* OR reversed:"ekawt"*) AND (name:"2026"* OR reversed:"6202"*) AND (name:"pdf"* OR reversed:"fdp"*)'
    )
  })

  it('neutralises FTS5 syntax', () => {
    expect(buildMatchQuery('"a" * -b AND NEAR(c')).toBe(
      '(name:"a"* OR reversed:"a"*) AND (name:"b"* OR reversed:"b"*) AND (name:"AND"* OR reversed:"DNA"*) AND (name:"NEAR"* OR reversed:"RAEN"*) AND (name:"c"* OR reversed:"c"*)'
    )
  })

  it('returns null when nothing is searchable', () => {
    expect(buildMatchQuery('')).toBeNull()
    expect(buildMatchQuery('  "*- ')).toBeNull()
  })

  it('composes accents before splitting', () => {
    expect(buildMatchQuery('été')).toBe('(name:"été"* OR reversed:"été"*)')
  })

  it('reverses by code point', () => {
    expect(buildMatchQuery('a𝒳b')).toBe('(name:"a𝒳b"* OR reversed:"b𝒳a"*)')
  })
})
