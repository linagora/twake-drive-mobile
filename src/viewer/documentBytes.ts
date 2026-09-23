import * as FileSystem from 'expo-file-system/legacy'
import type CozyClient from 'cozy-client'

import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { buildFreshDownloadUrl } from '@/files/streamUrl'
import { accountDir } from '@/storage/accountScope'

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

const viewerCacheRoot = (): string => `${FileSystem.cacheDirectory ?? ''}twake-drive/viewer/`

// One cache per account: the bytes of every document opened live here, and the
// account that logs in next must not read them.
const viewerCacheDir = (): string => accountDir(viewerCacheRoot())

/**
 * Drops the cache written before it was split per account: the `open/`
 * directory and the copies sitting at the root, the two shapes the old layout
 * wrote. These are copies of documents the stack can serve again, so they are
 * deleted rather than moved.
 */
export const dropLegacyViewerCache = async (): Promise<void> => {
  const root = viewerCacheRoot()
  const names = await FileSystem.readDirectoryAsync(root).catch(() => [])
  for (const name of names) {
    const entry = `${root}${name}`
    const info = await FileSystem.getInfoAsync(entry)
    if (!info.exists) continue
    if (name === 'open' || !info.isDirectory) {
      await FileSystem.deleteAsync(entry, { idempotent: true })
    }
  }
}

const sanitize = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '_')

/**
 * A copy of the document under its real name, which is what the OS viewer needs
 * to pick a handler: the cached copy is named after the id and the revision,
 * and iOS and Android both refuse to dispatch a file with no extension.
 */
export const readDocumentPathWithName = async (
  client: CozyClient,
  file: ViewableFile,
  driveId?: string
): Promise<string> => {
  const source = await readDocumentPath(client, file, driveId)
  // One directory per document, so the copy can carry the file's own name: the
  // OS viewer puts that name in its title bar.
  const directory = `${viewerCacheDir()}open/${file._id}-${file._rev ?? 'norev'}/`
  const named = `${directory}${sanitize(file.name)}`
  const existing = await FileSystem.getInfoAsync(named)
  if (!existing.exists) {
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true })
    await FileSystem.copyAsync({ from: source, to: named })
  }
  return named
}

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
 * Where the document is on disk, downloading it once if it is nowhere yet.
 *
 * A pinned file is read from what the pin keeps up to date. Anything else is
 * cached under `id-rev`, which is what lets a document opened before still
 * open with no network.
 */
export const readDocumentPath = async (
  client: CozyClient,
  file: ViewableFile,
  driveId?: string
): Promise<string> => {
  if (OfflineFilesStore.isPinnedAndDownloaded(file._id)) {
    return FileSystemRepo.localPath(file._id)
  }

  const path = cachePath(file)
  const cached = await FileSystem.getInfoAsync(path)
  if (cached.exists) return path

  if (!getOnlineMonitor().getCurrent()) throw new DocumentUnavailableOfflineError()

  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const token = stackClient.getAccessToken()
  if (!token) throw new Error('No access token available')

  await FileSystem.makeDirectoryAsync(viewerCacheDir(), { intermediates: true })
  const result = await FileSystem.downloadAsync(
    buildFreshDownloadUrl(stackClient.uri, file._id, driveId),
    path,
    { headers: { Authorization: `Bearer ${token}` } }
  )
  if (result.status >= 400) throw new Error(`Download failed (HTTP ${result.status})`)
  return path
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
): Promise<Uint8Array> => readFile(await readDocumentPath(client, file, driveId))
