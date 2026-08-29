import { DefaultTheme, DarkTheme, type Theme } from '@react-navigation/native'
import { cozyPalette, CozyPaletteScheme } from './cozyPalette'

/**
 * React Navigation owns its own theme context, separate from Paper's. Without
 * this the tab bar and every native Stack header keep React Navigation's
 * built-in light theme whatever the app theme is — which showed up as a white
 * settings header and a white tab bar sitting under a dark screen body.
 */
const toNavigationColors = (s: CozyPaletteScheme): Theme['colors'] => ({
  primary: s.primary,
  background: s.background,
  card: s.surface,
  text: s.onSurface,
  border: s.outline,
  notification: s.error
})

export const lightNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: toNavigationColors(cozyPalette.light)
}

export const darkNavigationTheme: Theme = {
  ...DarkTheme,
  colors: toNavigationColors(cozyPalette.dark)
}
