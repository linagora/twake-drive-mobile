import { useContext, useMemo } from 'react'
import { useClient } from 'cozy-client'

import { SharingContext } from './SharingProvider'
import { hasWriteAccess } from './writeAccess'

/**
 * Whether the current member may create inside `dirId`.
 *
 * Same source and same rules as twake-drive web: the sharings of
 * `io.cozy.files`, read through `hasWriteAccess(docId, driveId)`. A directory
 * nobody shared is writable, which is also how a subfolder of a shared folder
 * is answered — only the shared root carries a sharing of its own.
 */
export const useHasWriteAccess = (dirId: string | undefined, driveId?: string): boolean => {
  const { byId, sharings } = useContext(SharingContext)
  const client = useClient()
  const instanceUri = (client?.getStackClient().uri as string | undefined) ?? ''

  return useMemo(
    () => (dirId ? hasWriteAccess({ byId, sharings }, dirId, driveId, instanceUri) : false),
    [byId, sharings, dirId, driveId, instanceUri]
  )
}
