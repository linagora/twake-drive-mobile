import type { OfflineFileEntry } from '@/offline/types'

type Translate = (key: string) => string

const OFFLINE_LABEL_KEYS: Record<OfflineFileEntry['state'], string> = {
  downloaded: 'a11y.offlineAvailable',
  downloading: 'a11y.offlineDownloading',
  pending: 'a11y.offlinePending',
  failed: 'a11y.offlineFailed',
  'paused-auth': 'a11y.offlinePaused'
}

export interface RowLabelParts {
  name: string
  kind: 'file' | 'folder'
  /** The secondary line already shown on the row, e.g. "12 ko · hier". */
  description?: string
  shared?: boolean
  offlineState?: OfflineFileEntry['state']
}

/**
 * Builds what a screen reader announces for a whole row.
 *
 * The badges a sighted user reads at a glance — shared, kept offline — are
 * overlays inside the row, and an explicit label on the row replaces whatever
 * its children would have contributed. So each of them has to be spelled out
 * here or the information is lost.
 */
export const composeRowLabel = (t: Translate, parts: RowLabelParts): string =>
  [
    parts.name,
    t(parts.kind === 'folder' ? 'a11y.row.folder' : 'a11y.row.file'),
    parts.description,
    parts.shared ? t('a11y.row.shared') : undefined,
    parts.offlineState ? t(OFFLINE_LABEL_KEYS[parts.offlineState]) : undefined
  ]
    .filter(Boolean)
    .join(', ')
