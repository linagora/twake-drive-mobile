import { useEffect } from 'react'
import { AppState } from 'react-native'
import type CozyClient from 'cozy-client'
import { useClient } from 'cozy-client'

import { adoptStoredToken } from '@/auth/adoptStoredToken'
import { backupCore, type BackupStatus, type StopCause } from '@/native/twakeDriveCore'

import { isPhotoBackupEnabled, useIsPhotoBackupEnabled } from './backupFlag'
import { readBackupSettings, writeBackupSettings } from './backupSettings'
import { backupDeviceId } from './deviceId'
import { useBackupStatus } from './useBackupStatus'

/** What stops the backup for a while only: the network, the stack, a session to refresh. */
const PASSING: ReadonlySet<StopCause> = new Set(['Network', 'Server', 'Unauthorized'])
export const RETRY_MS = 60 * 1000

let running: Promise<BackupStatus | null> | null = null
let again = false
let againTitle: string | null = null

/**
 * One pass at a time. A call during a pass gets another one after it: the
 * backup may have been turned off and on again, in another folder or the
 * same, and the running pass stopped.
 *
 * `liveTitle` for a pass the user started: on iOS 26 it goes on once they
 * leave the app, shown by the system under that title.
 */
export const runBackupPass = (
  client: CozyClient | null,
  liveTitle: string | null = null
): Promise<BackupStatus | null> => {
  const core = backupCore()
  const { enabled, folder } = readBackupSettings()
  if (!core || !enabled || !folder || !isPhotoBackupEnabled()) return Promise.resolve(null)
  if (running) {
    again = true
    againTitle = againTitle ?? liveTitle
    return running
  }
  again = false
  againTitle = null
  running = (async () => {
    try {
      const status = await core.runBackupPass(folder.id, await backupDeviceId(), liveTitle)
      // The core follows its folder when the user moves it, or moves to another of the device.
      const now = readBackupSettings()
      const moved = status.folder
      if (
        moved &&
        now.enabled &&
        now.folder?.id === folder.id &&
        (moved.id !== folder.id || moved.path !== folder.path)
      ) {
        writeBackupSettings({ folder: moved })
      }
      return status
    } finally {
      // The core refreshes in the keychain: the refresh token in hand may be spent.
      await adoptStoredToken(client).catch(() => false)
      running = null
    }
  })().then(counts => (again ? runBackupPass(client, againTitle) : counts))
  return running
}

/**
 * A pass when the app starts and each time it comes back to the foreground,
 * and when the flags, read after the launch, turn the backup on. Stopped by
 * a cause that passes, the backup tries again every minute while the app is
 * on the screen: nothing else would start a pass there.
 */
export const useBackupPass = (): void => {
  const client = useClient()
  const allowed = useIsPhotoBackupEnabled()
  const { status } = useBackupStatus()
  const stalled = !!status?.stoppedBy && PASSING.has(status.stoppedBy)
  useEffect(() => {
    if (!allowed || !stalled) return
    const retry = setInterval(() => {
      if (AppState.currentState === 'active') runBackupPass(client).catch(() => null)
    }, RETRY_MS)
    return () => clearInterval(retry)
  }, [client, allowed, stalled])
  useEffect(() => {
    if (!allowed) return
    const pass = (): void => {
      // shortcut: a pass that fails before it starts, mostly offline, is
      // dropped and the next one tries again; the screen still shows the end
      // of the last pass that ran. Report it if users miss why it is old.
      runBackupPass(client).catch(() => null)
    }
    pass()
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') pass()
    })
    return () => sub.remove()
  }, [client, allowed])
}
