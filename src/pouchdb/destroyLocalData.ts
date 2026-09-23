import type CozyClient from 'cozy-client'

import { OFFLINE_FILES_STORE, OFFLINE_SETTINGS_STORE } from '@/offline/storage'
import { accountStorage } from '@/storage/accountScope'

import { resetLinks } from './getLinks'
import { POUCH_META_STORE } from './platformReactNative.storage'

const LOCAL_DATA_MMKV_IDS = [POUCH_META_STORE, OFFLINE_FILES_STORE, OFFLINE_SETTINGS_STORE]

export const destroyLocalData = async (client?: CozyClient): Promise<void> => {
  if (__DEV__) console.log('[destroyLocalData] wiping pouch + sync/offline MMKV')
  try {
    await resetLinks(client)
  } catch {
    // best effort — pouch may already be torn down
  }
  for (const id of LOCAL_DATA_MMKV_IDS) {
    try {
      accountStorage(id).clearAll()
    } catch {
      // ignore — the store may not have been opened this session
    }
  }
  if (__DEV__) console.log('[destroyLocalData] done')
}
