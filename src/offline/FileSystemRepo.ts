import * as FS from 'expo-file-system/legacy'

import { accountDir, accountKey, NO_ACCOUNT } from '@/storage/accountScope'

// TODO(offline-v1.5): backup exclusion on both platforms.
//   iOS:     set NSURLIsExcludedFromBackupKey on this directory so iCloud
//            Backup doesn't ingest it. Requires a small native module.
//   Android: extend the secure-store-generated backup rules
//            (referenced as @xml/secure_store_backup_rules and
//            @xml/secure_store_data_extraction_rules in AndroidManifest.xml)
//            to exclude `files/offline/`. Requires a custom expo config
//            plugin since android/ is prebuild-generated.
// Both deferred for v1 — users who care can disable app backup in OS settings.
const root = (): string => {
  if (!FS.documentDirectory) throw new Error('documentDirectory unavailable')
  return `${FS.documentDirectory}offline/`
}

// One directory per account, so the files kept offline by whoever logs in next
// are not the ones the previous account downloaded.
const dir = (): string => accountDir(root())

export const FileSystemRepo = {
  dir,
  localPath: (fileId: string): string => `${dir()}${fileId}`,
  async init(): Promise<void> {
    const info = await FS.getInfoAsync(dir())
    if (!info.exists) {
      await FS.makeDirectoryAsync(dir(), { intermediates: true })
    }
  },
  async exists(fileId: string): Promise<boolean> {
    const info = await FS.getInfoAsync(FileSystemRepo.localPath(fileId))
    return Boolean(info.exists)
  },
  async delete(fileId: string): Promise<void> {
    await FS.deleteAsync(FileSystemRepo.localPath(fileId), { idempotent: true })
  },
  /**
   * Hands the account in scope the copies downloaded before the directory was
   * split per account. They sit as plain files at the root of `offline/`.
   */
  async adoptLegacyFiles(): Promise<void> {
    if (accountKey() === NO_ACCOUNT) return
    const base = root()
    const names = await FS.readDirectoryAsync(base).catch(() => [])
    if (names.length === 0) return
    await FileSystemRepo.init()
    for (const name of names) {
      const from = `${base}${name}`
      const info = await FS.getInfoAsync(from)
      if (!info.exists || info.isDirectory) continue
      await FS.moveAsync({ from, to: `${dir()}${name}` })
    }
  }
}
