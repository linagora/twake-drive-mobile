import * as FileSystem from 'expo-file-system/legacy'
import type { SharedItem } from '@/files/uploadSharedFile'

// Persist a shared text/URL as a .txt file in cache so the upload pipeline can
// stream it like any other file. The name collides deterministically on
// "shared.txt"; uploadSharedFile's 409 dedupe assigns a unique server name.
export const textToSharedItem = async (text: string): Promise<SharedItem> => {
  const dir = FileSystem.cacheDirectory
  if (!dir) throw new Error('Cache directory unavailable')
  await FileSystem.makeDirectoryAsync(`${dir}twake-share/`, { intermediates: true })
  const path = `${dir}twake-share/shared.txt`
  await FileSystem.writeAsStringAsync(path, text)
  return { uri: path, name: 'shared.txt', mimeType: 'text/plain', size: text.length }
}
