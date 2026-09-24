import type CozyClient from 'cozy-client'

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

export interface StreamSource {
  uri: string
  headers: Record<string, string>
}

/**
 * `driveId` switches the download to the shared-drive route: a drive file is
 * held by the owner instance, which only serves it through the drive.
 *
 * The address is built from `rev` so that it stays the same for as long as the
 * document does: the players and the PDF viewer take the URL as the identity
 * of what they are showing, and restart on any change. Without a revision it
 * falls back to a one-off address, which is still correct, only wasteful.
 */
export const buildFileStreamSource = (
  client: CozyClient,
  fileId: string,
  driveId?: string,
  rev?: string
): StreamSource => {
  const stackClient = client.getStackClient() as unknown as MinimalStackClient
  const stackUri = stackClient.uri
  const token = stackClient.getAccessToken()
  if (!stackUri) throw new Error('Stack URI unavailable')
  if (!token) throw new Error('No access token available')
  return {
    uri: buildRevisionDownloadUrl(stackUri, fileId, rev, driveId),
    headers: { Authorization: `Bearer ${token}` }
  }
}

export const buildDownloadUrl = (stackUri: string, fileId: string, driveId?: string): string => {
  const base = stackUri.replace(/\/$/, '')
  const id = encodeURIComponent(fileId)
  return driveId
    ? `${base}/sharings/drives/${encodeURIComponent(driveId)}/download/${id}`
    : `${base}/files/download/${id}`
}

const withParam = (url: string, key: string, value: string): string =>
  `${url}${url.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`

const nonce = (): string => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/**
 * A download URL no HTTP cache can answer from a previous version of the file.
 *
 * The stack serves the download route with an ETag and a Last-Modified but no
 * Cache-Control, so NSURLSession and OkHttp both apply heuristic freshness to
 * it. React Native offers no cache policy on a download, hence the URL.
 */
export const buildFreshDownloadUrl = (stackUri: string, fileId: string, driveId?: string): string =>
  withParam(buildDownloadUrl(stackUri, fileId, driveId), 'fresh', nonce())

/** A download URL that changes with the revision, and only with it. */
export const buildRevisionDownloadUrl = (
  stackUri: string,
  fileId: string,
  rev?: string,
  driveId?: string
): string => {
  const url = buildDownloadUrl(stackUri, fileId, driveId)
  return rev ? withParam(url, 'rev', rev) : withParam(url, 'fresh', nonce())
}

export type ThumbnailSize = 'tiny' | 'small' | 'medium' | 'large'

export const buildThumbnailUrl = (
  client: CozyClient,
  links: { tiny?: string; small?: string; medium?: string; large?: string } | null | undefined,
  preferred: ThumbnailSize = 'medium'
): string | null => {
  if (!links) return null
  const link = links[preferred] ?? links.large ?? links.medium ?? links.small ?? links.tiny ?? null
  if (!link) return null
  const stackClient = client.getStackClient() as unknown as { uri?: string }
  const stackUri = stackClient.uri
  if (!stackUri) return null
  const base = stackUri.replace(/\/$/, '')
  return base + (link.startsWith('/') ? link : '/' + link)
}

export type PreviewKind = 'pdf' | 'image' | 'video' | 'audio' | 'text' | 'unsupported'

const TEXT_MIME_ALLOWLIST = new Set([
  'application/json',
  'application/xml',
  'application/x-yaml',
  'application/x-sh',
  'application/javascript',
  'application/typescript'
])

export const getPreviewKind = (
  file: { class?: string; mime?: string } | null | undefined
): PreviewKind => {
  if (!file) return 'unsupported'
  if (file.class === 'pdf' || file.mime === 'application/pdf') return 'pdf'
  if (file.class === 'image' || file.mime?.startsWith('image/')) return 'image'
  if (file.class === 'video' || file.mime?.startsWith('video/')) return 'video'
  if (file.class === 'audio' || file.mime?.startsWith('audio/')) return 'audio'
  if (file.class === 'text' || file.class === 'code') return 'text'
  if (file.mime?.startsWith('text/')) return 'text'
  if (file.mime && TEXT_MIME_ALLOWLIST.has(file.mime)) return 'text'
  return 'unsupported'
}

export const canPreviewInApp = (file: { class?: string; mime?: string }): boolean =>
  getPreviewKind(file) !== 'unsupported'
