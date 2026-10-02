import { useQuery } from 'cozy-client'

import {
  FileQueryResult,
  folderFilesQuery,
  folderFilesQueryAs,
  SHARED_WITH_ME_DIR_ID
} from '@/client/queries'

const BADGE_MAX = 99

type WithSharingStatus = Pick<FileQueryResult, 'metadata'>

/**
 * Whether a document is the shortcut of a share nobody opened yet. Same test
 * as cozy-client's `isSharingShortcutNew`, which twake-drive web counts on.
 */
export const isNewSharingShortcut = (file: WithSharingStatus): boolean =>
  file.metadata?.sharing?.status === 'new'

export const countNewShares = (files: WithSharingStatus[] | null | undefined): number =>
  (files ?? []).filter(isNewSharingShortcut).length

/**
 * What the tab badge shows for a count: nothing at zero, and `99+` past 99
 * like twake-drive web's `NavContent`.
 */
export const formatBadgeCount = (count: number): string | number | undefined => {
  if (count <= 0) return undefined
  return count > BADGE_MAX ? `${BADGE_MAX}+` : count
}

/**
 * Number of received shares that were not opened yet.
 *
 * Read from the local replica rather than through the sharings, which are only
 * known online: the stack puts the shortcut of a received share in the
 * shared-with-me directory. The query is the plain folder listing, so it
 * reuses its index, and the status is filtered here because a condition on a
 * nested path fails open on the replica (see `favoritesQuery`).
 */
export const useNewSharesCount = (): number => {
  const { data } = useQuery(folderFilesQuery(SHARED_WITH_ME_DIR_ID), {
    as: folderFilesQueryAs(SHARED_WITH_ME_DIR_ID)
  })
  return countNewShares(data as FileQueryResult[] | null | undefined)
}
