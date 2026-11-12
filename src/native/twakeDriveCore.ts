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
  /** Among `pending`, the media the phone could not read (iCloud out of reach). */
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

export interface BackupStatus extends BackupCounts {
  /** End of the last pass, in Unix seconds. */
  lastPassAt?: number
  stoppedBy?: StopCause
}

/** When the backup may go: Wi-Fi only unless mobile data is allowed. */
export interface BackupConditions {
  cellularPhotos: boolean
  cellularVideos: boolean
  onlyCharging: boolean
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
  photoAccess: () => PhotoAccess
  retryFailed: () => Promise<void>
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
}

const native = requireOptionalNativeModule<TwakeDriveCoreNative>('TwakeDriveCore')

/** Null where the Rust core is not built in (Android, for now). */
export const md5File = async (path: string): Promise<string | null> =>
  native ? native.md5File(path) : null

/** The photo backup of the Rust core, null where it is not built in. */
export const backupCore = (): Omit<TwakeDriveCoreNative, 'md5File'> | null => native
