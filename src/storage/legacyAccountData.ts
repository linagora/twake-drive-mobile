import { FileSystemRepo } from '@/offline/FileSystemRepo'
import { OFFLINE_FILES_STORE, OFFLINE_SETTINGS_STORE } from '@/offline/storage'
import { POUCH_META_STORE } from '@/pouchdb/platformReactNative.storage'
import { dropLegacyViewerCache } from '@/viewer/documentBytes'

import { adoptLegacyStorage } from './accountScope'

const LEGACY_STORES = [POUCH_META_STORE, OFFLINE_FILES_STORE, OFFLINE_SETTINGS_STORE]

/**
 * Data written before local storage was split per account belongs to the
 * account that was logged in then, which is the one opening the app now.
 *
 * Runs before the links are built: the replication sequences live in one of
 * these stores, and reading them empty would replay the whole replication.
 */
export const adoptLegacyStores = (): void => {
  for (const id of LEGACY_STORES) {
    try {
      adoptLegacyStorage(id)
    } catch {
      // ignore — the store may not exist on this device
    }
  }
}

export const adoptLegacyFiles = async (): Promise<void> => {
  try {
    await FileSystemRepo.adoptLegacyFiles()
  } catch {
    // ignore — nothing kept offline yet
  }
  try {
    await dropLegacyViewerCache()
  } catch {
    // ignore — the cache is rebuilt on demand
  }
}
