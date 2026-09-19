import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import type CozyClient from 'cozy-client'

import { ensureLocalCopy, openFileNatively } from './openFile'

export interface DownloadableFile {
  _id: string
  name: string
  mime?: string
}

export class DownloadCancelledError extends Error {
  constructor() {
    super('The user did not pick a destination')
    this.name = 'DownloadCancelledError'
  }
}

const writeToDirectory = async (
  localPath: string,
  directoryUri: string,
  file: DownloadableFile
): Promise<string> => {
  const target = await FileSystem.StorageAccessFramework.createFileAsync(
    directoryUri,
    file.name,
    file.mime ?? 'application/octet-stream'
  )
  const contents = await FileSystem.readAsStringAsync(localPath, {
    encoding: FileSystem.EncodingType.Base64
  })
  await FileSystem.writeAsStringAsync(target, contents, {
    encoding: FileSystem.EncodingType.Base64
  })
  return target
}

/**
 * Saves a file to a folder of the device.
 *
 * Android has a place for that and an API to reach it, so the file is written
 * where the user points. iOS has no such folder: the system sheet, with its
 * "Save to Files", is the way there.
 */
export const download = async (
  client: CozyClient,
  file: DownloadableFile,
  driveId?: string
): Promise<void> => {
  if (Platform.OS !== 'android') {
    await openFileNatively(client, file, driveId)
    return
  }
  const localPath = await ensureLocalCopy(client, file, driveId)
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync()
  if (!permission.granted) throw new DownloadCancelledError()
  await writeToDirectory(localPath, permission.directoryUri, file)
}
