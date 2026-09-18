import { FileSharingEntry } from './SharingProvider'

interface DatedDoc {
  created_at?: string
  updated_at?: string
  attributes?: { created_at?: string; updated_at?: string }
}

const datesOf = (doc: DatedDoc | undefined): Array<string | undefined> => [
  doc?.created_at ?? doc?.attributes?.created_at,
  doc?.updated_at ?? doc?.attributes?.updated_at
]

export interface DatedFile {
  updated_at?: string
  created_at?: string
}

/**
 * When a shared document was last touched, as the shares view counts it.
 *
 * Mirrors twake-drive web's `getSharingsLastUpdatedAt`: the latest of the
 * document's own dates and of the activity on what shares it, so a folder
 * shared yesterday does not sink to the bottom of the list because its content
 * has not moved since last year.
 */
export const sharedFileLastUpdatedAt = (
  file: DatedFile,
  entry?: FileSharingEntry
): string | undefined =>
  [
    file.updated_at,
    file.created_at,
    ...datesOf(entry?.sharing as DatedDoc | undefined),
    ...datesOf(entry?.linkPermission as DatedDoc | undefined)
  ]
    .filter((date): date is string => !!date)
    .sort()
    .pop()
