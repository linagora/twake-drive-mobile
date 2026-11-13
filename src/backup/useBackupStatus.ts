import { useCallback, useEffect, useRef, useState } from 'react'
import { AppState } from 'react-native'

import {
  backupCore,
  type BackupCounts,
  type BackupStatus,
  type PhotoAccess
} from '@/native/twakeDriveCore'

export interface BackupState {
  status: BackupStatus | null
  access: PhotoAccess | null
  retryFailed: () => Promise<void>
}

/** The share of the library the backup is done with, from 0 to 1. */
export const savedShare = ({ done, pending, skipped, failed }: BackupCounts): number => {
  const total = done + pending + skipped + failed
  return total === 0 ? 1 : (total - pending) / total
}

/**
 * The state of the backup as the core keeps it: read when the screen opens
 * and when the app comes back, then after each media of a pass running.
 */
export const useBackupStatus = (): BackupState => {
  const [status, setStatus] = useState<BackupStatus | null>(null)
  const [access, setAccess] = useState<PhotoAccess | null>(null)
  const progressCount = useRef(0)

  const refresh = useCallback(async (): Promise<void> => {
    const core = backupCore()
    if (!core) return
    setAccess(core.photoAccess())
    const before = progressCount.current
    const read = await core.backupStatus().catch(() => null)
    // A pass running may have told a newer state meanwhile.
    if (read && progressCount.current === before) setStatus(read)
  }, [])

  useEffect(() => {
    const core = backupCore()
    if (!core) return
    void refresh()
    const progress = core.addListener('onBackupProgress', next => {
      progressCount.current += 1
      setStatus(next)
    })
    const foreground = AppState.addEventListener('change', next => {
      if (next === 'active') void refresh()
    })
    return () => {
      progress.remove()
      foreground.remove()
    }
  }, [refresh])

  const retryFailed = useCallback(async (): Promise<void> => {
    await backupCore()?.retryFailed()
    await refresh()
  }, [refresh])

  return { status, access, retryFailed }
}
