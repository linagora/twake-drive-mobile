import { createMMKV } from 'react-native-mmkv'

const STORAGE_KEY = 'pendingDocumentEdits'

export interface PendingEdit {
  fileId: string
  name: string
  /** Set when the document belongs to a shared drive, which owns its writes. */
  driveId?: string
  mime?: string
  /** Where the edited copy is on disk. */
  path: string
  editedAt: number
}

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'viewer-edits' })
} catch {
  storage = null
}

const read = (): PendingEdit[] => {
  const raw = storage?.getString(STORAGE_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as PendingEdit[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const write = (edits: PendingEdit[]): void => {
  storage?.set(STORAGE_KEY, JSON.stringify(edits))
}

/** The edits waiting for a network, oldest first. */
export const pendingEdits = (): PendingEdit[] => read()

/**
 * Remembers an edit that could not be sent yet. One entry per document: what
 * matters is the last state of the file, not how many times it was touched.
 */
export const rememberEdit = (edit: PendingEdit): void => {
  write([...read().filter(pending => pending.fileId !== edit.fileId), edit])
}

export const forgetEdit = (fileId: string): void => {
  write(read().filter(pending => pending.fileId !== fileId))
}

export const hasPendingEdit = (fileId: string): boolean =>
  read().some(pending => pending.fileId === fileId)
