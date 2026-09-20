/**
 * The name to show for something kept offline.
 *
 * The entry in the store carries the name the file had when it was pinned,
 * which is a copy: it goes stale on a rename, and on Android it can come back
 * from the system in another Unicode form than the one the document holds.
 * The document is the source of truth; the stored name is the fallback for a
 * file the app no longer knows, and both are composed (NFC) so an accent is
 * one character rather than a letter followed by a mark.
 */
export const offlineDisplayName = (
  entry: { fileId: string; name?: string },
  documentName?: string
): string => (documentName || entry.name || entry.fileId).normalize('NFC')
