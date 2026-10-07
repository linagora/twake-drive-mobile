import * as DocumentPicker from 'expo-document-picker'

import type { SharedItem } from '@/files/uploadSharedFile'

/**
 * Opens the system document picker (SAF on Android, the document picker on
 * iOS) and returns what the user chose, shaped like a shared item so it takes
 * the share intent's upload path. Empty when the user cancels.
 *
 * The picker copies each file into the app's cache: the upload streams from a
 * real `file://` path, which a provider-owned `content://` uri is not.
 */
export const pickDocuments = async (): Promise<SharedItem[]> => {
  const res = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    multiple: true,
    copyToCacheDirectory: true
  })
  if (res.canceled) return []
  return res.assets.map(a => ({
    uri: a.uri,
    name: a.name,
    mimeType: a.mimeType ?? 'application/octet-stream',
    size: a.size
  }))
}
