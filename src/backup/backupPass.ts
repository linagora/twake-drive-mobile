import { useEffect } from 'react'
import { AppState } from 'react-native'
import type CozyClient from 'cozy-client'
import { useClient } from 'cozy-client'

import { adoptStoredToken } from '@/auth/adoptStoredToken'
import { backupCore, type BackupCounts } from '@/native/twakeDriveCore'

import { readBackupSettings } from './backupSettings'
import { backupDeviceId } from './deviceId'

let running: Promise<BackupCounts | null> | null = null
let again = false

/**
 * One pass at a time. A call during a pass gets another one after it: the
 * backup may have been turned off and on again, in another folder or the
 * same, and the running pass stopped.
 */
export const runBackupPass = (client: CozyClient | null): Promise<BackupCounts | null> => {
  const core = backupCore()
  const { enabled, folder } = readBackupSettings()
  if (!core || !enabled || !folder) return Promise.resolve(null)
  if (running) {
    again = true
    return running
  }
  again = false
  running = (async () => {
    try {
      return await core.runBackupPass(folder.id, await backupDeviceId())
    } finally {
      // The core refreshes in the keychain: the refresh token in hand may be spent.
      await adoptStoredToken(client).catch(() => false)
      running = null
    }
  })().then(counts => (again ? runBackupPass(client) : counts))
  return running
}

/** A pass when the app starts and each time it comes back to the foreground. */
export const useBackupPass = (): void => {
  const client = useClient()
  useEffect(() => {
    const pass = (): void => {
      // shortcut: a failed pass is dropped, mostly offline; the next one tries
      // again. Report it once the backup screen shows the state.
      runBackupPass(client).catch(() => null)
    }
    pass()
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') pass()
    })
    return () => sub.remove()
  }, [client])
}
