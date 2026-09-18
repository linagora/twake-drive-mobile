import * as FileSystem from 'expo-file-system/legacy'
import type CozyClient from 'cozy-client'

import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { buildDownloadUrl } from '@/files/streamUrl'

export const OFFLINE_ERROR = 'DocumentUnavailableOfflineError'

export class DocumentUnavailableOfflineError extends Error {
  constructor() {
    super('Document not available offline')
    this.name = OFFLINE_ERROR
  }
}

export interface ViewableFile {
  _id: string
  _rev?: string
  name: string
}

const viewerCacheDir = (): string => `${FileSystem.cacheDirectory ?? ''}twake-drive/viewer/`

/** Keyed by revision, so a new version of a file is fetched rather than read
 *  from the copy of the previous one. */
const cachePath = (file: ViewableFile): string =>
  `${viewerCacheDir()}${file._id}-${file._rev ?? 'norev'}`

const toBytes = (base64: string): Uint8Array => {
  const binary = global.atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const readFile = async (path: string): Promise<Uint8Array> =>
  toBytes(await FileSystem.readAsStringAsync(path, { encoding: 'base64' }))

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

/**
 * The bytes a local viewer renders.
 *
 * A pinned file is read from what the pin keeps up to date. Anything else is
 * downloaded once into the OS cache under `id-rev` and read from there next
 * time, which is what lets a file that was opened before still open offline.
 * A file that is neither pinned nor cached cannot be opened without network.
 */
export const readDocumentBytes = async (
  client: CozyClient,
  file: ViewableFile,
  driveId?: string
): Promise<Uint8Array> => {
  if (OfflineFilesStore.isPinnedAndDownloaded(file._id)) {
    return readFile(FileSystemRepo.localPath(file._id))
  }

  const path = cachePath(file)
  const cached = await FileSystem.getInfoAsync(path)
  if (cached.exists) return readFile(path)

  if (!getOnlineMonitor().getCurrent()) throw new DocumentUnavailableOfflineError()

  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const token = stackClient.getAccessToken()
  if (!token) throw new Error('No access token available')

  await FileSystem.makeDirectoryAsync(viewerCacheDir(), { intermediates: true })
  const result = await FileSystem.downloadAsync(
    buildDownloadUrl(stackClient.uri, file._id, driveId),
    path,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (result.status >= 400) throw new Error(`Download failed (HTTP ${result.status})`)
  return readFile(path)
}
