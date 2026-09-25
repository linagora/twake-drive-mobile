import { createMMKV } from 'react-native-mmkv'

import { clearSession } from './tokenStorage'

const INSTALL_MARKER_KEY = 'installSeen'

/**
 * MMKV lives in the app container, which deleting the app takes with it. The
 * keychain does not: an item written there outlives the install that wrote it,
 * which is why a reinstall came back signed in with every local database empty.
 */
let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/**
 * Drops a session left behind by a previous install.
 *
 * Called before anything reads the session. A launch with no marker is an
 * install that has never run: whatever the keychain still holds belongs to an
 * app the user deleted, so it goes. Every launch after that finds the marker
 * and leaves the session alone.
 */
export const clearSessionLeftByAPreviousInstall = async (): Promise<boolean> => {
  // Without storage there is no way to tell a fresh install from a relaunch,
  // and signing the user out on every launch would be worse than the bug.
  if (!storage) return false
  if (storage.getString(INSTALL_MARKER_KEY)) return false
  // Cleared first, marked after: a keychain that could not be read yet is
  // worth another try on the next launch, where marking first would leave the
  // session behind for good. Clearing twice costs nothing.
  await clearSession()
  storage.set(INSTALL_MARKER_KEY, 'yes')
  return true
}
