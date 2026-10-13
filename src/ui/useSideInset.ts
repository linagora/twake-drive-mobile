import { useSafeAreaInsets } from 'react-native-safe-area-context'

/**
 * The inset a screen keeps on both sides of its content: in landscape the
 * navigation bar sits at one edge, and Paper's app bar and the tab bar pad
 * both by the larger side so the screen stays symmetric.
 */
export const useSideInset = (): number => {
  const { left, right } = useSafeAreaInsets()
  return Math.max(left, right)
}
