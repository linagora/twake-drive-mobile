import { accountStorage } from '@/storage/accountScope'

export const OFFLINE_FILES_STORE = 'offline-files'
export const OFFLINE_SETTINGS_STORE = 'offline-settings'

export const offlineFilesStorage = accountStorage(OFFLINE_FILES_STORE)
export const offlineSettingsStorage = accountStorage(OFFLINE_SETTINGS_STORE)

export const FILE_KEY_PREFIX = 'offline:file:'
export const FOLDER_KEY_PREFIX = 'offline:folder:'
export const SETTINGS_KEY = 'settings'
export const STATUS_KEY = 'status'

export const fileKey = (fileId: string): string => `${FILE_KEY_PREFIX}${fileId}`
export const folderKey = (dirId: string): string => `${FOLDER_KEY_PREFIX}${dirId}`
