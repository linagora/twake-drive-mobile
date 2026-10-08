import * as FileSystem from 'expo-file-system/legacy'
import ReactNativeBlobUtil from 'react-native-blob-util'
import type CozyClient from 'cozy-client'

export interface SharedItem {
  uri: string
  name: string
  mimeType: string
  size?: number
}
export interface UploadedFile {
  _id: string
  name: string
}
export type UploadProgress = (fraction: number) => void

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

const MAX_DEDUPE = 50

const splitName = (name: string): { base: string; ext: string } => {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return { base: name, ext: '' }
  return { base: name.slice(0, dot), ext: name.slice(dot) }
}

const dedupeName = (name: string, attempt: number): string => {
  if (attempt === 0) return name
  const { base, ext } = splitName(name)
  return `${base} (${attempt})${ext}`
}

// react-native-blob-util streams from a real filesystem path (no file://).
const toLocalPath = (uri: string): string =>
  uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri

const toFileUri = (uri: string): string =>
  uri.startsWith('file://') || uri.startsWith('content://') ? uri : `file://${uri}`

// react-native-blob-util sends an empty body, and the stack creates an empty
// file, when it cannot open the path it is given.
const ensureReadable = async (fileUri: string, announcedSize?: number): Promise<void> => {
  const info = await FileSystem.getInfoAsync(fileUri).catch(() => null)
  const isEmptyByMistake =
    info?.exists && fileUri.startsWith('file://') && info.size === 0 && (announcedSize ?? 0) > 0
  if (!info?.exists || isEmptyByMistake) throw new Error('Shared file is not readable')
}

// Same prefix cozy-stack-client's FileCollection builds for a drive-scoped
// createFile: the shared drive routes, or the instance's own `/files`.
const uploadPrefix = (driveId?: string): string =>
  driveId ? `/sharings/drives/${encodeURIComponent(driveId)}` : '/files'

interface UploadResponse {
  info: () => { status: number }
  json: () => { data?: { id?: string; _id?: string; attributes?: { name?: string } } }
}

export const uploadSharedFile = async (
  client: CozyClient,
  item: SharedItem,
  dirId: string,
  onProgress?: UploadProgress,
  driveId?: string
): Promise<UploadedFile> => {
  const stack = client.getStackClient() as unknown as MinimalStackClient
  const token = stack.getAccessToken()
  if (!token) throw new Error('No access token available')
  const fileUri = toFileUri(item.uri)
  await ensureReadable(fileUri, item.size)
  const path = toLocalPath(fileUri)
  const contentType = item.mimeType || 'application/octet-stream'

  for (let attempt = 0; attempt < MAX_DEDUPE; attempt++) {
    const name = dedupeName(item.name, attempt)
    const url =
      `${stack.uri}${uploadPrefix(driveId)}/${encodeURIComponent(dirId)}` +
      `?Type=file&Name=${encodeURIComponent(name)}`
    const res = (await ReactNativeBlobUtil.fetch(
      'POST',
      url,
      { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
      ReactNativeBlobUtil.wrap(path)
    ).uploadProgress((written: number, total: number) => {
      if (total > 0) onProgress?.(written / total)
    })) as unknown as UploadResponse

    const status = res.info().status
    if (status === 409) continue // name conflict → retry with a suffix
    if (status >= 400) throw new Error(`Upload failed (HTTP ${status})`)

    const data = res.json().data ?? {}
    const id = data.id ?? data._id
    if (!id) throw new Error('Upload returned no id')
    onProgress?.(1)
    return { _id: id, name: data.attributes?.name ?? name }
  }
  throw new Error('Could not find a free filename after multiple attempts')
}
