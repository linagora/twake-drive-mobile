import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { StyleSheet } from 'react-native'
import { Snackbar } from 'react-native-paper'

import { cozyTokens } from '@/ui/theme'

interface SnackbarState {
  message: string | null
  // Bumped on every notify so a new message gets its full duration.
  id: number
  notify: (message: string) => void
  dismiss: () => void
}

const SnackbarContext = createContext<SnackbarState | null>(null)

const useSnackbarState = (): SnackbarState => {
  const state = useContext(SnackbarContext)
  if (!state) throw new Error('Snackbar hooks must be used inside a SnackbarHost')
  return state
}

/**
 * Holds a message for a sheet that confirms its action and closes: a snackbar
 * of its own would unmount with it before it could be read. A
 * `SnackbarOutlet` in the screen underneath draws it.
 */
export const SnackbarHost = ({ children }: { children: React.ReactNode }): React.ReactElement => {
  const [message, setMessage] = useState<string | null>(null)
  const [id, setId] = useState(0)
  const notify = useCallback((next: string): void => {
    setMessage(next)
    setId(n => n + 1)
  }, [])
  const dismiss = useCallback((): void => setMessage(null), [])
  const value = useMemo(() => ({ message, id, notify, dismiss }), [message, id, notify, dismiss])
  return <SnackbarContext.Provider value={value}>{children}</SnackbarContext.Provider>
}

export const useNotify = (): ((message: string) => void) => useSnackbarState().notify

export const SnackbarOutlet = (): React.ReactElement => {
  const { message, id, dismiss } = useSnackbarState()
  return (
    <Snackbar
      key={id}
      visible={!!message}
      onDismiss={dismiss}
      duration={3000}
      wrapperStyle={styles.snackbar}
    >
      {message ?? ''}
    </Snackbar>
  )
}

// The drive tabs draw their own outlet, above the tab bar; move and import
// close as they notify.
const WITHOUT_OUTLET = new Set(['(drive)', 'move/[ids]', 'import'])

/**
 * Root stack `screenLayout`: an outlet in every other screen, inside its own
 * sheet, since an iOS page sheet covers anything drawn at the root.
 */
export const withSnackbarOutlet = ({
  route,
  children
}: {
  route: { name: string }
  children: React.ReactElement
}): React.ReactElement =>
  WITHOUT_OUTLET.has(route.name) ? (
    children
  ) : (
    <>
      {children}
      <SnackbarOutlet />
    </>
  )

const styles = StyleSheet.create({
  snackbar: { zIndex: cozyTokens.zIndex.snackbar }
})
