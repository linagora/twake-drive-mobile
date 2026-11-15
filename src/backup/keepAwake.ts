import { useEffect, useState } from 'react'
import { AppState } from 'react-native'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'

import type { BackupStatus, PhotoAccess } from '@/native/twakeDriveCore'

import { useIsPhotoBackupEnabled } from './backupFlag'
import { onBackupSettingsChange, readBackupSettings } from './backupSettings'
import { useBackupStatus } from './useBackupStatus'

const TAG = 'photo-backup'

/** Media left, and nothing that holds them all back. */
export const isBackupSending = (status: BackupStatus | null, access: PhotoAccess | null): boolean =>
  !!status &&
  status.pending - status.unavailable > 0 &&
  !status.stoppedBy &&
  access !== 'denied' &&
  access !== 'restricted'

export interface KeepAwakeInput {
  status: BackupStatus | null
  access: PhotoAccess | null
  /** The instance flag of the backup. */
  allowed: boolean
  /** The user's choice. */
  enabled: boolean
  /** `AppState.currentState`: null or unknown before the first change. */
  appState: string | null | undefined
  /** When the media the backup went through last changed, or it was asked to go. */
  lastProgressAt: number
  now: number
}

/**
 * Without a media gone through for this long, nothing is sent: offline, a
 * retry later, a lease to run out. A single upload may take longer.
 */
export const STALL_MS = 5 * 60 * 1000

/** The app in front sends much faster: the screen stays on while it sends. */
export const shouldKeepAwake = ({
  status,
  access,
  allowed,
  enabled,
  appState,
  lastProgressAt,
  now
}: KeepAwakeInput): boolean =>
  allowed &&
  enabled &&
  appState === 'active' &&
  isBackupSending(status, access) &&
  now - lastProgressAt < STALL_MS

const wentThrough = (status: BackupStatus | null): number | null =>
  status ? status.done + status.skipped + status.failed : null

export const useKeepAwakeWhileBackingUp = (): void => {
  const { status, access } = useBackupStatus()
  const allowed = useIsPhotoBackupEnabled()
  const [enabled, setEnabled] = useState(() => readBackupSettings().enabled)
  const [appState, setAppState] = useState<string | null | undefined>(AppState.currentState)
  const [lastProgressAt, setLastProgressAt] = useState(Date.now)
  const [now, setNow] = useState(Date.now)
  useEffect(() => onBackupSettingsChange(() => setEnabled(readBackupSettings().enabled)), [])
  useEffect(() => {
    const sub = AppState.addEventListener('change', setAppState)
    return () => sub.remove()
  }, [])
  // Coming back to the app or turning the backup on starts a pass: a fresh wait.
  const progress = wentThrough(status)
  useEffect(() => {
    const at = Date.now()
    setLastProgressAt(at)
    setNow(at)
    const stall = setTimeout(() => setNow(Date.now()), STALL_MS)
    return () => clearTimeout(stall)
  }, [progress, appState, enabled])
  const keep = shouldKeepAwake({
    status,
    access,
    allowed,
    enabled,
    appState,
    lastProgressAt,
    now
  })
  useEffect(() => {
    if (!keep) return
    activateKeepAwakeAsync(TAG).catch(() => null)
    return () => {
      deactivateKeepAwake(TAG).catch(() => null)
    }
  }, [keep])
}
