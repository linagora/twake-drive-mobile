import { useEffect, useRef } from 'react'
import CozyClient, { useClient } from 'cozy-client'

import { refreshDocumentFromStack } from '@/files/refreshDocument'

/** Room for the editor to push its last keystrokes to the stack. */
export const EDITOR_SAVE_GRACE_MS = 3000

/**
 * Reads the document back from the stack when the screen editing it goes away,
 * once immediately and once after the editor's own save delay.
 */
export const useRefreshOnLeave = (fileId?: string, driveId?: string): void => {
  const client = useClient()
  const latest = useRef<{ client?: CozyClient; fileId?: string; driveId?: string }>({})
  latest.current = { client: client ?? undefined, fileId, driveId }
  useEffect(
    () => () => {
      const { client: c, fileId: id, driveId: drive } = latest.current
      if (!c || !id) return
      void refreshDocumentFromStack(c, id, drive)
      setTimeout(() => void refreshDocumentFromStack(c, id, drive), EDITOR_SAVE_GRACE_MS)
    },
    []
  )
}
