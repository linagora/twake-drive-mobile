import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { createMMKV } from 'react-native-mmkv'
import type CozyClient from 'cozy-client'

import { ensureLocalCopy, openFileNatively } from './openFile'

export interface DownloadableFile {
  _id: string
  name: string
  mime?: string
}

// Android grants a folder for as long as the app is installed, so the picker
// is a one-off: asking again on every file is what made downloading tedious.
const DOWNLOAD_DIR_KEY = 'download-directory-uri'

let store: ReturnType<typeof createMMKV> | null = null
const preferences = (): ReturnType<typeof createMMKV> | null => {
  if (store) return store
  try {
    store = createMMKV({ id: 'app-preferences' })
  } catch {
    store = null
  }
  return store
}

const rememberedDirectory = (): string | null => preferences()?.getString(DOWNLOAD_DIR_KEY) ?? null

const rememberDirectory = (uri: string): void => {
  preferences()?.set(DOWNLOAD_DIR_KEY, uri)
}

export const forgetDownloadDirectory = (): void => {
  preferences()?.remove(DOWNLOAD_DIR_KEY)
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
 * where the user points, and the folder is remembered for the next file. iOS
 * has no such folder: the system sheet, with its "Save to Files", is the way
 * there.
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
  const remembered = rememberedDirectory()
  if (remembered) {
    try {
      await writeToDirectory(localPath, remembered, file)
      return
    } catch {
      // The folder is gone, or its grant was taken back: ask for another one.
      forgetDownloadDirectory()
    }
  }
  const permission = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync(
    remembered ?? undefined
  )
  if (!permission.granted) throw new DownloadCancelledError()
  rememberDirectory(permission.directoryUri)
  await writeToDirectory(localPath, permission.directoryUri, file)
}
