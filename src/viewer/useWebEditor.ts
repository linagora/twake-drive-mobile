import { useCallback } from 'react'
import { useClient } from 'cozy-client'

import { useSessionCode } from '@/auth/useSessionCode'
import { EditableDocument, openWebEditor } from './webEditor'

/**
 * Opens a document in its web editor, asking the stack for a session code
 * first — and certifying this client if the stack refuses one, which is what
 * makes the certification happen on the first edit rather than at login.
 */
export const useWebEditor = (): ((file: EditableDocument, driveId?: string) => Promise<void>) => {
  const client = useClient()
  const fetchSessionCode = useSessionCode()
  return useCallback(
    async (file: EditableDocument, driveId?: string) => {
      if (!client) throw new Error('No cozy client')
      await openWebEditor(client, file, driveId, fetchSessionCode)
    },
    [client, fetchSessionCode]
  )
}
