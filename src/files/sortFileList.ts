import type { FolderSort } from '@/ui/useFolderSort'

const BY_NAME: FolderSort = { attr: 'name', dir: 'asc' }

// localeCompare with options builds a collator on every call.
const collator = new Intl.Collator(undefined, { sensitivity: 'base' })

/** Orders names as a person reads them: case and accents aside, "Été" with "E". */
export const compareNames = (a: { name: string }, b: { name: string }): number =>
  collator.compare(a.name, b.name)

interface Listed {
  name: string
  type?: string
  updated_at?: string
}

/** Folders first, then by name or date, as asked. */
export const sortFileList = <T extends Listed>(
  items: readonly T[],
  sort: FolderSort = BY_NAME
): T[] => {
  const direction = sort.dir === 'asc' ? 1 : -1
  return [...items].sort(
    (a, b) =>
      Number(b.type === 'directory') - Number(a.type === 'directory') ||
      direction *
        (sort.attr === 'updated_at'
          ? (a.updated_at ?? '').localeCompare(b.updated_at ?? '')
          : compareNames(a, b))
  )
}
