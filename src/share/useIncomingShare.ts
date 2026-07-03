import { useMemo } from 'react'
import { useShareIntent } from 'expo-share-intent'
import type { SharedItem } from '@/files/uploadSharedFile'

export interface IncomingShare {
  items: SharedItem[]
  text?: string
  hasShare: boolean
  reset: () => void
}

interface RawFile {
  path?: string
  fileName?: string
  mimeType?: string
  size?: number | null
}

const normalizeUri = (path: string): string =>
  path.startsWith('file://') || path.startsWith('content://') ? path : `file://${path}`

const toItems = (files: unknown): SharedItem[] => {
  if (!Array.isArray(files)) return []
  return (files as RawFile[]).map(f => ({
    uri: normalizeUri(f.path ?? ''),
    name: f.fileName ?? 'shared',
    mimeType: f.mimeType ?? 'application/octet-stream',
    size: f.size ?? undefined
  }))
}

export const useIncomingShare = (): IncomingShare => {
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntent()
  const si = shareIntent as { files?: unknown; text?: string; webUrl?: string } | null
  const text = si?.text ?? si?.webUrl ?? undefined
  // Rebuilding `items` fresh every render (a new array/object identity even
  // when the share hasn't changed) re-triggers PendingShareProvider's staging
  // effect, which depends on this reference. Memoize on the raw files
  // reference so `items` is stable across renders where the share is unchanged.
  const files = si?.files
  const items = useMemo(() => toItems(files), [files])
  return {
    items,
    text,
    hasShare: !!hasShareIntent,
    reset: resetShareIntent
  }
}
