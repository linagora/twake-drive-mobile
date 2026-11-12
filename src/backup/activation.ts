import { backupCore, type DeviceFolder, type PhotoAccess } from '@/native/twakeDriveCore'

import { writeBackupSettings } from './backupSettings'
import { backupDeviceId } from './deviceId'

export type ActivationStep =
  | { kind: 'unavailable' }
  | { kind: 'denied'; access: PhotoAccess }
  | { kind: 'ready'; folder: DeviceFolder }
  /** No folder carries this phone's id: the user picks one or names a new one. */
  | { kind: 'choose'; folders: DeviceFolder[]; suggestedName: string }

export type FolderChoice =
  | { adopt: DeviceFolder }
  /** `rootName` is the flagship app's translated root, so both apps share it. */
  | { create: string; rootName: string }

const ready = (folder: DeviceFolder): ActivationStep => {
  writeBackupSettings({ enabled: true, folder: { id: folder.id, path: folder.path } })
  return { kind: 'ready', folder }
}

/**
 * Turns the backup on. The phone's own folder is used at once. Otherwise
 * nothing is created before the user chose: a phone the flagship app backed
 * up has a new id here, and a new folder would send its library again.
 */
export const startActivation = async (): Promise<ActivationStep> => {
  const core = backupCore()
  if (!core) return { kind: 'unavailable' }
  const access = await core.requestPhotoAccess()
  if (access === 'denied' || access === 'restricted') return { kind: 'denied', access }
  const [deviceId, folders] = await Promise.all([backupDeviceId(), core.listDeviceFolders()])
  const own = folders.find(folder => folder.deviceIds.includes(deviceId))
  if (own) return ready(own)
  return { kind: 'choose', folders, suggestedName: await core.deviceName() }
}

export const finishActivation = async (choice: FolderChoice): Promise<ActivationStep> => {
  const core = backupCore()
  if (!core) return { kind: 'unavailable' }
  const deviceId = await backupDeviceId()
  const folder =
    'adopt' in choice
      ? await core.adoptDeviceFolder(choice.adopt.id, deviceId)
      : await core.createDeviceFolder(deviceId, choice.create.trim(), choice.rootName)
  return ready(folder)
}

export const stopBackup = (): void => {
  writeBackupSettings({ enabled: false })
}
