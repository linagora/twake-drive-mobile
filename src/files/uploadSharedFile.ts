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

interface UploadResponse {
  info: () => { status: number }
  json: () => { data?: { id?: string; _id?: string; attributes?: { name?: string } } }
}

export const uploadSharedFile = async (
  client: CozyClient,
  item: SharedItem,
  dirId: string,
  onProgress?: UploadProgress
): Promise<UploadedFile> => {
  const stack = client.getStackClient() as unknown as MinimalStackClient
  const token = stack.getAccessToken()
  if (!token) throw new Error('No access token available')
  const path = toLocalPath(item.uri)
  const contentType = item.mimeType || 'application/octet-stream'

  for (let attempt = 0; attempt < MAX_DEDUPE; attempt++) {
    const name = dedupeName(item.name, attempt)
    const url =
      `${stack.uri}/files/${encodeURIComponent(dirId)}` +
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
