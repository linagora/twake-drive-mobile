import { MD3LightTheme, MD3DarkTheme, MD3Theme } from 'react-native-paper'
import { cozyPalette, CozyPaletteScheme } from './cozyPalette'

const toColors = (s: CozyPaletteScheme) => ({
  primary: s.primary,
  primaryContainer: s.primaryContainer,
  secondary: s.secondary,
  error: s.error,
  background: s.background,
  surface: s.surface,
  onSurface: s.onSurface,
  onSurfaceVariant: s.onSurfaceVariant,
  outline: s.outline,
  surfaceVariant: s.surfaceVariant
})

/**
 * Non-colour design tokens. Colours live in cozyPalette and reach components
 * through Paper's theme; everything else that a component would otherwise
 * hardcode belongs here, so the future standalone RN package has one source of
 * truth to ship. Add to this rather than writing a bare number in a StyleSheet.
 */
export const cozyTokens = {
  radius: { sm: 6, md: 12 },
  /** 4pt scale. `md` (16) is the standard horizontal screen gutter. */
  spacing: { xxs: 2, xs: 4, sm: 8, md: 16, lg: 20, xl: 24, xxl: 32 },
  /** Icon sizes: `sm` for inline affordances, `md` for row/appbar icons. */
  iconSize: { sm: 20, md: 24, lg: 32 },
  /** Width reserved for a row's leading icon so iconless rows still align. */
  rowLeadingSlot: 32,
  /** Avatar diameters: `sm` in an app bar, `md` in an account header. */
  avatarSize: { sm: 32, md: 40 },
  /** Twake wordmark/logo sizes per surface. */
  logoSize: { appBar: 28, hero: 76 },
  shadowColor: '#0A1F44'
}

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: { ...MD3LightTheme.colors, ...toColors(cozyPalette.light) }
}

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: { ...MD3DarkTheme.colors, ...toColors(cozyPalette.dark) }
}
