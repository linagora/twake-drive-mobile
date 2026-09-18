/**
 * A `.cozy-note` is downloaded either as plain Markdown or, when the note has
 * images, as a tar holding `index.md` next to them. Nothing else in the app
 * reads a tar, so this keeps the format handling in one place.
 */

const TAR_BLOCK = 512
const TAR_MAGIC_OFFSET = 257

export interface NoteContent {
  markdown: string
  /** Images carried by the note, by the name `index.md` refers to them with. */
  images: Map<string, Uint8Array>
}

const decoder = new TextDecoder()

const readString = (bytes: Uint8Array, offset: number, length: number): string =>
  decoder
    .decode(bytes.subarray(offset, offset + length))
    .replace(/\0.*$/, '')
    .trim()

export const isTar = (bytes: Uint8Array): boolean =>
  bytes.length > TAR_MAGIC_OFFSET + 5 && readString(bytes, TAR_MAGIC_OFFSET, 5).startsWith('ustar')

/**
 * Walks the tar headers and returns every regular file it holds. Sizes are
 * octal, entries are padded to 512 bytes, and two empty blocks end the archive.
 */
export const readTarEntries = (bytes: Uint8Array): Map<string, Uint8Array> => {
  const entries = new Map<string, Uint8Array>()
  let offset = 0
  while (offset + TAR_BLOCK <= bytes.length) {
    const name = readString(bytes, offset, 100)
    if (!name) break
    const size = parseInt(readString(bytes, offset + 124, 12) || '0', 8)
    const typeFlag = readString(bytes, offset + 156, 1)
    const start = offset + TAR_BLOCK
    if (Number.isNaN(size) || start + size > bytes.length) break
    // '0' and '' are regular files; directories and the rest are skipped.
    if (typeFlag === '' || typeFlag === '0') {
      entries.set(name, bytes.subarray(start, start + size))
    }
    offset = start + Math.ceil(size / TAR_BLOCK) * TAR_BLOCK
  }
  return entries
}

/** The Markdown of a note, with the images it refers to when it carries any. */
export const readNoteContent = (bytes: Uint8Array): NoteContent => {
  if (!isTar(bytes)) return { markdown: decoder.decode(bytes), images: new Map() }

  const entries = readTarEntries(bytes)
  const indexKey = [...entries.keys()].find(name => name.replace(/^\.\//, '') === 'index.md')
  const markdown = indexKey ? decoder.decode(entries.get(indexKey)) : ''
  const images = new Map<string, Uint8Array>()
  for (const [name, content] of entries) {
    if (name === indexKey) continue
    images.set(name.replace(/^\.\//, ''), content)
  }
  return { markdown, images }
}
