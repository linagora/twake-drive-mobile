import { requireOptionalNativeModule } from 'expo'

export type PhotoAccess = 'authorized' | 'limited' | 'denied' | 'restricted' | 'notDetermined'

/** The Drive folder the backup of one phone goes to. */
export interface DeviceFolder {
  id: string
  name: string
  path: string
  deviceIds: string[]
  createdAt: string
}

export interface BackupCounts {
  done: number
  pending: number
  skipped: number
  failed: number
  /** Among `pending`, the media the phone could not read (an iCloud original out of reach on iOS). */
  unavailable: number
}

/** What stopped the last pass for every media. */
export type StopCause =
  | 'QuotaExceeded'
  | 'Network'
  | 'Unauthorized'
  | 'Server'
  | 'Refused'
  /** Held back by the user's conditions. */
  | 'WaitingForWifi'
  | 'WaitingForPower'
  /** The folder of the device is gone: the backup waits for the user. */
  | 'FolderGone'

export interface BackupStatus extends BackupCounts {
  /** End of the last pass, in Unix seconds. */
  lastPassAt?: number
  stoppedBy?: StopCause
  /** Where the backup goes, moved or made again since the app read its settings. */
  folder?: { id: string; path: string }
}

/** When the backup may go: Wi-Fi only unless mobile data is allowed. */
export interface BackupConditions {
  cellularPhotos: boolean
  cellularVideos: boolean
  onlyCharging: boolean
}

/** Picked: its media go. Left out: its media never go. None: neutral. */
export type AlbumChoice = 'picked' | 'leftOut'

export interface PhoneAlbum {
  id: string
  title: string
  count: number
  choice?: AlbumChoice
}

interface TwakeDriveCoreNative {
  md5File: (path: string) => Promise<string>
  requestPhotoAccess: () => Promise<PhotoAccess>
  deviceName: () => Promise<string>
  listDeviceFolders: () => Promise<DeviceFolder[]>
  adoptDeviceFolder: (folderId: string, deviceId: string) => Promise<DeviceFolder>
  createDeviceFolder: (
    deviceId: string,
    deviceName: string,
    rootName: string
  ) => Promise<DeviceFolder>
  runBackupPass: (folderId: string, deviceId: string) => Promise<BackupStatus>
  stopBackupPass: () => void
  backupStatus: () => Promise<BackupStatus>
  recreateDeviceFolder: (folderPath: string | null) => Promise<void>
  photoAccess: () => PhotoAccess
  retryFailed: () => Promise<void>
  listAlbums: () => Promise<PhoneAlbum[]>
  setAlbumChoice: (albumId: string, choice: AlbumChoice | null) => Promise<void>
  backupConditions: () => Promise<BackupConditions>
  setBackupConditions: (
    cellularPhotos: boolean,
    cellularVideos: boolean,
    onlyCharging: boolean
  ) => Promise<void>
  addListener: (
    event: 'onBackupProgress',
    listener: (status: BackupStatus) => void
  ) => { remove: () => void }
  batteryOptimized?: () => boolean
  openBatteryOptimizationSettings?: () => void
}

const native = requireOptionalNativeModule<TwakeDriveCoreNative>('TwakeDriveCore')

/** Null where the Rust core is not built in (tests, a build without it). */
export const md5File = async (path: string): Promise<string | null> =>
  native ? native.md5File(path) : null

/**
 * Android only: the battery optimization, which holds the passes of a new
 * photo back until a maintenance window, and the system settings where the
 * user lifts it. Null where the platform has none.
 */
export const batteryOptimization = (): {
  isOn: () => boolean
  openSettings: () => void
} | null => {
  const isOn = native?.batteryOptimized
  const openSettings = native?.openBatteryOptimizationSettings
  if (!isOn || !openSettings) return null
  return {
    // Thrown while the app context is torn down: nothing to tell then.
    isOn: () => {
      try {
        return isOn()
      } catch {
        return false
      }
    },
    openSettings
  }
}

type BackupCore = Omit<
  TwakeDriveCoreNative,
  'md5File' | 'batteryOptimized' | 'openBatteryOptimizationSettings'
>

/** Everything the backup screens call: a module missing one offers no backup. */
export const BACKUP_API: Record<keyof BackupCore, true> = {
  requestPhotoAccess: true,
  deviceName: true,
  listDeviceFolders: true,
  adoptDeviceFolder: true,
  createDeviceFolder: true,
  runBackupPass: true,
  stopBackupPass: true,
  backupStatus: true,
  recreateDeviceFolder: true,
  photoAccess: true,
  retryFailed: true,
  listAlbums: true,
  setAlbumChoice: true,
  backupConditions: true,
  setBackupConditions: true,
  addListener: true
}

/** The photo backup of the Rust core, null where the core or its whole backup engine is missing. */
export const backupCore = (): BackupCore | null =>
  native && Object.keys(BACKUP_API).every(name => name in native) ? native : null
