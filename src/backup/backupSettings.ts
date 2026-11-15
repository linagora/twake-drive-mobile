import { accountStorage } from '@/storage/accountScope'

export interface BackupSettings {
  enabled: boolean
  folder: { id: string; path: string } | null
  /** End of the pass whose full Drive paywall the user closed. */
  paywallClosedFor?: number
}

const DEFAULT: BackupSettings = { enabled: false, folder: null }
const KEY = 'settings'
const storage = accountStorage('photo-backup')

export const readBackupSettings = (): BackupSettings => {
  const raw = storage.getString(KEY)
  if (!raw) return DEFAULT
  try {
    return { ...DEFAULT, ...(JSON.parse(raw) as Partial<BackupSettings>) }
  } catch {
    return DEFAULT
  }
}

const listeners = new Set<() => void>()

export const writeBackupSettings = (patch: Partial<BackupSettings>): BackupSettings => {
  const next = { ...readBackupSettings(), ...patch }
  storage.set(KEY, JSON.stringify(next))
  listeners.forEach(listener => listener())
  return next
}

/** Called after each write; returns the unsubscribe. */
export const onBackupSettingsChange = (listener: () => void): (() => void) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
