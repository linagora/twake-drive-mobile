import { createContext, useContext } from 'react'

import type { FileQueryResult } from '@/client/queries'

export interface MoveContextValue {
  idList: string[]
  firstDoc: FileQueryResult | null
  isLoading: boolean
  hasError: boolean
  isBusy: boolean
  onConfirm: (dest: { _id: string; name: string }) => Promise<void>
  onCancel: () => void
  retry: () => void
}

export const MoveContext = createContext<MoveContextValue | null>(null)

export const useMoveContext = (): MoveContextValue => {
  const ctx = useContext(MoveContext)
  if (!ctx) throw new Error('useMoveContext must be used inside MoveLayout')
  return ctx
}
