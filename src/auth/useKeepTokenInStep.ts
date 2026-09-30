import { useEffect } from 'react'
import { AppState } from 'react-native'
import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

import { adoptStoredToken } from './adoptStoredToken'

/**
 * Reads the keychain back every time the app returns to the front.
 *
 * While the app is away the File Provider extension refreshes on its own and
 * stores what the stack rotated. Coming back with the token from before that
 * means presenting one that has been spent.
 */
export const useKeepTokenInStep = (client: CozyClient | null | undefined): void => {
  useEffect(() => {
    if (!client) return
    const subscription = AppState.addEventListener('change', state => {
      if (state !== 'active') return
      void adoptStoredToken(client)
        .then(adopted => {
          if (adopted) triggerPouchReplication(client, undefined, { immediate: true })
        })
        .catch(err => console.warn('[useKeepTokenInStep] could not read the stored token', err))
    })
    return () => subscription.remove()
  }, [client])
}
