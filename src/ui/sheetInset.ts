import { Platform, StatusBar } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * The top inset a screen presented as a sheet has to add for itself.
 *
 * An iOS pageSheet already starts below the status bar, and the single root
 * SafeAreaProvider measures the window rather than the sheet, so the inset it
 * reports there is a band of empty space. Android presents the same routes
 * full-screen and still has a status bar to clear.
 */
export const useSheetTopInset = (): number => {
  const insets = useSafeAreaInsets()
  return Platform.OS === 'ios' ? 0 : insets.top || StatusBar.currentHeight || 0
}

/**
 * The bottom inset a screen presented as a sheet has to keep clear: the Android
 * navigation bar, or the iOS home indicator. Both platforms draw the sheet down
 * to the bottom edge of the window, so the window's inset is the right one.
 */
export const useSheetBottomInset = (): number => useSafeAreaInsets().bottom
