import { Directory, File, Paths } from 'expo-file-system'

// TODO(offline-v1.5): backup exclusion on both platforms.
//   iOS:     set NSURLIsExcludedFromBackupKey on this directory so iCloud
//            Backup doesn't ingest it. Requires a small native module.
//   Android: extend the secure-store-generated backup rules
//            (referenced as @xml/secure_store_backup_rules and
//            @xml/secure_store_data_extraction_rules in AndroidManifest.xml)
//            to exclude `files/offline/`. Requires a custom expo config
//            plugin since android/ is prebuild-generated.
// Both deferred for v1 — users who care can disable app backup in OS settings.
const directory = (): Directory => new Directory(Paths.document, 'offline')

export const FileSystemRepo = {
  // Returns a `file:///` URI string. Other modules (Downloader, video player
  // source, FileViewer) take a URI string, so we don't expose File instances.
  localPath: (fileId: string): string => new File(directory(), fileId).uri,
  async init(): Promise<void> {
    const d = directory()
    if (!d.exists) d.create({ intermediates: true })
  },
  async exists(fileId: string): Promise<boolean> {
    return new File(directory(), fileId).exists
  },
  async delete(fileId: string): Promise<void> {
    const f = new File(directory(), fileId)
    if (f.exists) f.delete()
  },
  async totalBytes(): Promise<number> {
    const d = directory()
    if (!d.exists) return 0
    let total = 0
    for (const entry of d.list()) {
      if (entry instanceof File) total += entry.size
    }
    return total
  }
}
