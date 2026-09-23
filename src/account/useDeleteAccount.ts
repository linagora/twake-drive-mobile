import { useCallback } from 'react'
import { useClient } from 'cozy-client'

import { openDeleteAccount } from '@/account/deleteAccount'
import { useSessionCode } from '@/auth/useSessionCode'

/** Opens the account deletion page of the settings web app, signed in. */
export const useDeleteAccount = (): (() => Promise<void>) => {
  const client = useClient()
  const fetchSessionCode = useSessionCode()
  return useCallback(async () => {
    if (!client) throw new Error('No cozy client')
    await openDeleteAccount(client, fetchSessionCode)
  }, [client, fetchSessionCode])
}
