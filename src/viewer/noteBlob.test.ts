import { isTar, readNoteContent, readTarEntries, resolveNoteImage } from './noteBlob'

const encoder = new TextEncoder()

const octal = (value: number, length: number): string =>
  value.toString(8).padStart(length - 1, '0') + '\0'

const tarEntry = (name: string, content: Uint8Array): Uint8Array => {
  const header = new Uint8Array(512)
  header.set(encoder.encode(name), 0)
  header.set(encoder.encode(octal(content.length, 12)), 124)
  header.set(encoder.encode('0'), 156)
  header.set(encoder.encode('ustar\0'), 257)
  const padded = new Uint8Array(Math.ceil(content.length / 512) * 512)
  padded.set(content, 0)
  const entry = new Uint8Array(header.length + padded.length)
  entry.set(header, 0)
  entry.set(padded, header.length)
  return entry
}

const tar = (files: [string, string][]): Uint8Array => {
  const parts = files.map(([name, content]) => tarEntry(name, encoder.encode(content)))
  const end = new Uint8Array(1024)
  const total = parts.reduce((n, p) => n + p.length, 0) + end.length
  const out = new Uint8Array(total)
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  out.set(end, at)
  return out
}

describe('readNoteContent', () => {
  it('reads a note downloaded as plain markdown', () => {
    const note = readNoteContent(encoder.encode('# Titre\n\nUn paragraphe.'))
    expect(note.markdown).toBe('# Titre\n\nUn paragraphe.')
    expect(note.images.size).toBe(0)
  })

  it('reads the markdown of a note downloaded as a tar', () => {
    const note = readNoteContent(
      tar([
        ['index.md', '# Avec image'],
        ['image.png', 'PNGDATA']
      ])
    )
    expect(note.markdown).toBe('# Avec image')
  })

  it('keeps the images a note carries, under the name it refers to them with', () => {
    const note = readNoteContent(
      tar([
        ['./index.md', 'body'],
        ['./photo.jpg', 'JPEG']
      ])
    )
    expect([...note.images.keys()]).toEqual(['photo.jpg'])
  })

  it('has no markdown to show when the tar holds no index', () => {
    expect(readNoteContent(tar([['other.md', 'nope']])).markdown).toBe('')
  })
})

describe('isTar', () => {
  it('recognises a tar by its magic', () => {
    expect(isTar(tar([['index.md', 'x']]))).toBe(true)
  })

  it('does not take markdown for a tar', () => {
    expect(isTar(encoder.encode('# not a tar, just a long enough note body'.repeat(20)))).toBe(
      false
    )
  })
})

describe('readTarEntries', () => {
  it('stops at the end of the archive rather than reading past it', () => {
    expect([
      ...readTarEntries(
        tar([
          ['a.md', 'a'],
          ['b.png', 'b']
        ])
      ).keys()
    ]).toEqual(['a.md', 'b.png'])
  })
})

describe('resolveNoteImage', () => {
  const images = new Map([
    ['Capture decran 2025-10-07 a 16.30.06.png', encoder.encode('PNG1')],
    ['schema.png', encoder.encode('PNG2')]
  ])

  it('matches the image on the file name the alt text carries, accents aside', () => {
    const image = resolveNoteImage(images, {
      src: 'noteid/imageid',
      alt: 'Capture d’écran 2025-10-07 à 16.30.06.png',
      index: 1
    })
    expect(image?.name).toBe('Capture decran 2025-10-07 a 16.30.06.png')
  })

  it('falls back on the rank of the image when no name matches', () => {
    const image = resolveNoteImage(images, { src: 'noteid/other', alt: '', index: 1 })
    expect(image?.name).toBe('schema.png')
  })

  it('has nothing to give when the note carries no image', () => {
    expect(resolveNoteImage(new Map(), { src: 'a', alt: 'b', index: 0 })).toBeNull()
  })

  it('has nothing to give when the rank is past what the note carries', () => {
    expect(resolveNoteImage(images, { src: 'a', alt: 'nope.png', index: 5 })).toBeNull()
  })
})
