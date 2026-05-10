import { useCallback, useMemo, useState } from 'react'

export interface MultiSelect {
  selectedIds: Set<string>
  count: number
  isSelecting: boolean
  isSelected: (id: string) => boolean
  select: (id: string) => void
  deselect: (id: string) => void
  toggle: (id: string) => void
  clear: () => void
}

/**
 * Track a set of selected item IDs. `isSelecting` flips to true the moment
 * any id is selected and back to false when cleared, which screens use to
 * swap the AppBar/menu/long-press behaviour.
 */
export const useMultiSelect = (): MultiSelect => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())

  const select = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const deselect = useCallback((id: string) => {
    setSelectedIds(prev => {
      if (!prev.has(id)) return prev
      const next = new Set(prev)
      next.delete(id)
      return next
    })
  }, [])

  const toggle = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const clear = useCallback(() => {
    setSelectedIds(prev => (prev.size === 0 ? prev : new Set()))
  }, [])

  const isSelected = useCallback((id: string) => selectedIds.has(id), [selectedIds])

  return useMemo(
    () => ({
      selectedIds,
      count: selectedIds.size,
      isSelecting: selectedIds.size > 0,
      isSelected,
      select,
      deselect,
      toggle,
      clear
    }),
    [selectedIds, isSelected, select, deselect, toggle, clear]
  )
}
