import flag from 'cozy-flags'

import { useFlag } from '@/client/useFlag'
import { backupCore } from '@/native/twakeDriveCore'

import { readBackupSettings } from './backupSettings'

export const PHOTO_BACKUP_FLAG = 'drive.mobile.photo-backup.enabled'

/** Off unless the instance turns it on. */
export const isPhotoBackupEnabled = (): boolean => flag(PHOTO_BACKUP_FLAG) === true

/** The same, for a screen: it shows again when the flags land after it. */
export const useIsPhotoBackupEnabled = (): boolean => useFlag(PHOTO_BACKUP_FLAG) === true

/**
 * To call once the flags were read from the stack, never on the defaults an
 * offline start leaves: the passes the system starts stop. The user's choices,
 * the queue and the folder in Drive stay; the next pass after the flag is
 * turned on again gives the core back the folder it lost.
 */
export const stopBackupTheInstanceTurnedOff = (): void => {
  if (!isPhotoBackupEnabled() && readBackupSettings().enabled) backupCore()?.stopBackupPass()
}
