import * as FS from 'expo-file-system/legacy'
import type CozyClient from 'cozy-client'

import { destroyLocalData } from '@/pouchdb/destroyLocalData'
import { accountDir } from '@/storage/accountScope'

/**
 * Everything this device holds for the account in scope.
 *
 * Resolved through the account in scope, so this has to run BEFORE the scope
 * is cleared: afterwards the paths point at the no-account directory and the
 * real one stays on disk.
 */
const accountDirectories = (): string[] => [
  accountDir(`${FS.documentDirectory ?? ''}offline/`),
  accountDir(`${FS.cacheDirectory ?? ''}twake-drive/viewer/`)
]

export const wipeDeviceData = async (client?: CozyClient): Promise<void> => {
  await destroyLocalData(client)
  for (const path of accountDirectories()) {
    try {
      await FS.deleteAsync(path, { idempotent: true })
    } catch {
      // A directory the OS holds open must not strand the rest of the wipe.
    }
  }
}
