import { useCallback, useRef, useState } from 'react'

interface ActionsDrawer {
  visible: boolean
  open: () => void
  close: () => void
  /** Closes the drawer, then runs `action` once it is fully gone, so that a
   *  sheet or dialog the action presents never lands on a dismissing modal. */
  run: (action: () => void) => void
  /** To hand to the `onDismissed` of the BottomDrawer. */
  onDismissed: () => void
}

export const useActionsDrawer = (): ActionsDrawer => {
  const [visible, setVisible] = useState(false)
  const pending = useRef<(() => void) | null>(null)
  const open = useCallback(() => setVisible(true), [])
  const close = useCallback(() => setVisible(false), [])
  const run = useCallback((action: () => void) => {
    pending.current = action
    setVisible(false)
  }, [])
  const onDismissed = useCallback(() => {
    const action = pending.current
    pending.current = null
    action?.()
  }, [])
  return { visible, open, close, run, onDismissed }
}
