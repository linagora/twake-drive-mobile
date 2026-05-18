import { Directory, File, Paths } from 'expo-file-system'
import FileViewer from 'react-native-file-viewer'
import type CozyClient from 'cozy-client'

import { OfflineFilesStore } from '@/offline/OfflineFilesStore'
import { FileSystemRepo } from '@/offline/FileSystemRepo'

export interface OpenableFile {
  _id: string
  name: string
  mime?: string
}

const sanitizeName = (name: string): string => name.replace(/[/\\?%*:|"<>]/g, '_')

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

export const openFileNatively = async (
  client: CozyClient,
  file: OpenableFile
): Promise<void> => {
  const cacheTwakeDir = new Directory(Paths.cache, 'twake-drive')
  if (!cacheTwakeDir.exists) cacheTwakeDir.create({ intermediates: true })
  const aliasFile = new File(cacheTwakeDir, `${file._id}-${sanitizeName(file.name)}`)

  if (OfflineFilesStore.isPinnedAndDownloaded(file._id)) {
    // The persistent blob is stored as `offline/{fileId}` with no
    // extension; without one, iOS (UIDocumentInteractionController)
    // and Android both fail to dispatch the viewer and hang. Copy
    // to a cache path that carries the real filename + extension.
    // The cacheDirectory is OS-managed so the copy is short-lived.
    const blobFile = new File(FileSystemRepo.localPath(file._id))
    if (!blobFile.exists) {
      throw new Error(`Pinned blob missing on disk: ${blobFile.uri}`)
    }
    if (!aliasFile.exists) blobFile.copy(aliasFile)
    await FileViewer.open(aliasFile.uri, {
      showOpenWithDialog: true,
      showAppsSuggestions: true
    })
    return
  }

  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const stackUri = stackClient.uri
  const token = stackClient.getAccessToken()
  if (!token) throw new Error('No access token available')

  const downloadUrl = `${stackUri}/files/download/${encodeURIComponent(file._id)}`
  // File.downloadFileAsync rejects on non-2xx with `UnableToDownload`
  // whose message includes the status code, so we don't need a manual
  // status check. `idempotent: true` overwrites a stale cache alias.
  const downloaded = await File.downloadFileAsync(downloadUrl, aliasFile, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true
  })

  await FileViewer.open(downloaded.uri, {
    showOpenWithDialog: true,
    showAppsSuggestions: true
  })
}
