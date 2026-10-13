import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { createMMKV } from 'react-native-mmkv'
import ReactNativeBlobUtil from 'react-native-blob-util'
import type CozyClient from 'cozy-client'

import { accountDir } from '@/storage/accountScope'
import { ensureLocalCopy, openFileNatively, openInViewer } from './openFile'

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
const saveLocalCopy = async (localPath: string, file: DownloadableFile): Promise<void> => {
  if (Platform.OS !== 'android') {
    await openInViewer(localPath)
    return
  }
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

export const download = async (
  client: CozyClient,
  file: DownloadableFile,
  driveId?: string
): Promise<void> => {
  if (Platform.OS !== 'android') {
    await openFileNatively(client, file, driveId)
    return
  }
  await saveLocalCopy(await ensureLocalCopy(client, file, driveId), file)
}

/** How long a request to the system downloader has to fail to count as refused. */
const ENQUEUE_GRACE_MS = 1500

const sanitizeZipName = (name: string): string => `${name}.zip`.replace(/[/\\?%*:|"<>]/g, '_')

/**
 * Asks the system downloader for the zip: it fetches it into the public
 * Downloads folder, shows its own notification and carries on when the app is
 * left, so nothing goes through JS memory. The promise of a task only settles
 * once the file is complete, so a request still running after the grace
 * period is taken as accepted.
 */
const enqueueSystemDownload = async (url: string, zipName: string): Promise<void> => {
  const task = ReactNativeBlobUtil.config({
    addAndroidDownloads: {
      useDownloadManager: true,
      notification: true,
      storeInDownloads: true,
      mediaScannable: true,
      title: zipName,
      description: zipName,
      mime: 'application/zip'
    }
  }).fetch('GET', url)
  const refused = task.then(
    () => null,
    (e: unknown) => e ?? new Error('Download refused')
  )
  const rejection = await Promise.race([
    refused,
    new Promise<null>(resolve => setTimeout(() => resolve(null), ENQUEUE_GRACE_MS))
  ])
  if (rejection) throw rejection instanceof Error ? rejection : new Error(String(rejection))
}

/**
 * Hands a folder to the device as a zip, the way twake-drive web does
 * (`downloadArchive`): the stack builds the archive on request and answers a
 * link to it, which needs no token of its own.
 *
 * Android has the system download manager fetch it into Downloads ('queued');
 * iOS fetches it into the account's viewer cache, where the previous one is
 * replaced and a logout wipes it, and shows the system sheet ('opened').
 */
export const downloadFolder = async (
  client: CozyClient,
  folder: { _id: string; name: string }
): Promise<'queued' | 'opened'> => {
  const stackClient = client.getStackClient()
  const href = (await stackClient.collection('io.cozy.files').createArchiveLinkByIds({
    ids: [folder._id],
    name: folder.name
  })) as string
  const zipName = sanitizeZipName(folder.name)
  const url = stackClient.fullpath(href)
  if (Platform.OS === 'android') {
    await enqueueSystemDownload(url, zipName)
    return 'queued'
  }
  const cacheDir = FileSystem.cacheDirectory
  if (!cacheDir) throw new Error('Cache directory unavailable')
  const archives = `${accountDir(`${cacheDir}twake-drive/viewer/`)}archives/`
  await FileSystem.deleteAsync(archives, { idempotent: true })
  // a folder of its own, so the preview opens the zip under its plain name
  const dir = `${archives}${folder._id}/`
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true })
  const token = stackClient.getAccessToken()
  const result = await FileSystem.downloadAsync(url, `${dir}${zipName}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  })
  if (result.status >= 400) throw new Error(`Download failed (HTTP ${result.status})`)
  await openInViewer(result.uri)
  return 'opened'
}
