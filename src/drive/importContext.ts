import { createContext, useContext } from 'react'

import type { SharedItem } from '@/files/uploadSharedFile'

export interface ImportContextValue {
  items: SharedItem[]
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
}

export const ImportContext = createContext<ImportContextValue | null>(null)

export const useImportContext = (): ImportContextValue => {
  const ctx = useContext(ImportContext)
  if (!ctx) throw new Error('useImportContext must be used inside ImportLayout')
  return ctx
}
