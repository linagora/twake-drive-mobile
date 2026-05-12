export type OfflineFileState =
  | 'pending'
  | 'downloading'
  | 'downloaded'
  | 'failed'
  | 'paused-auth'

export interface OfflineFileEntry {
  fileId: string
  state: OfflineFileState
  rev: string
  md5sum: string
  size: number
  bytesDownloaded?: number
  localPath: string
  pinnedAt: number
  isDirectPin: boolean
  parentFolderPins: string[]
  retryCount?: number
  lastError?: string
}

export interface OfflineFolderEntry {
  dirId: string
  pinnedAt: number
  name: string
}

export interface OfflineSettings {
  wifiOnly: boolean
}

export interface OfflineStatus {
  diskFull: boolean
}

export interface OfflineFolderAggregateState {
  total: number
  downloaded: number
  downloading: number
  failed: number
  bytes: number
}
