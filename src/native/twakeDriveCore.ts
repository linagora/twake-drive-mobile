import { requireOptionalNativeModule } from 'expo'

export type PhotoAccess = 'authorized' | 'limited' | 'denied' | 'restricted'

/** The Drive folder the backup of one phone goes to. */
export interface DeviceFolder {
  id: string
  name: string
  path: string
  deviceIds: string[]
  createdAt: string
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
}

const native = requireOptionalNativeModule<TwakeDriveCoreNative>('TwakeDriveCore')

/** Null where the Rust core is not built in (Android, for now). */
export const md5File = async (path: string): Promise<string | null> =>
  native ? native.md5File(path) : null

/** The photo backup of the Rust core, null where it is not built in. */
export const backupCore = (): Omit<TwakeDriveCoreNative, 'md5File'> | null => native
