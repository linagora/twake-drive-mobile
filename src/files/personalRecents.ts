import type { Href } from 'expo-router'

import { FileQueryResult, PERSONAL_RECENTS_DOCTYPE } from '@/client/queries'
import { isInTrash } from '@/files/isInTrash'

export interface PersonalRecent extends FileQueryResult {
  file?: { data?: FileQueryResult | null }
}

export interface RecentsPage {
  data: unknown[]
  next?: boolean
}

/** A recent whose item the user can no longer read stands for itself, with only its last known name and type. */
export const isUnreadableRecent = (item: { _type?: string }): boolean =>
  item._type === PERSONAL_RECENTS_DOCTYPE

/** Row actions take the drive of the screen, and a trashed item only offers restore and destroy, from the Bin. */
export const hasRecentActions = (item: FileQueryResult): boolean =>
  !isUnreadableRecent(item) && !item.driveId && !isInTrash(item)

export const makeRowsFromRecents = (recents: PersonalRecent[]): FileQueryResult[] =>
  recents.map(({ file, ...lastKnown }) => file?.data ?? lastKnown)

const FOCUS_REFETCH_AGE_MS = 60 * 1000

/** A refetch drops the loaded pages for the first one, so coming back to the list soon keeps them. */
export const isOldEnoughToRefetch = (lastUpdate: number | null | undefined, now: number): boolean =>
  !lastUpdate || now - lastUpdate > FOCUS_REFETCH_AGE_MS

export const makeNoAccessRoute = (item: Pick<FileQueryResult, 'name' | 'type'>): Href => ({
  pathname: '/no-access',
  params: { name: item.name, type: item.type }
})

/**
 * The stack may answer a page with no recent and still have a next one, which
 * adds no row and leaves the end of the list where it was: follow the cursor
 * until a page brings some.
 */
export const fetchMoreUntilRows = async (
  fetchMore: () => Promise<RecentsPage | undefined>
): Promise<void> => {
  let page: RecentsPage | undefined
  do {
    page = await fetchMore()
  } while (page?.next === true && page.data.length === 0)
}
