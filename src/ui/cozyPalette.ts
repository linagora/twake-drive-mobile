// Source : @linagora/twake-css/palette.json, réparti par mode comme
// twake-ui/packages/twake-mui/src/lib/makePalette.ts.
import twakePalette from '@linagora/twake-css/palette.json'

export type CozyPaletteScheme = {
  primary: string
  primaryContainer: string
  secondary: string
  error: string
  background: string
  surface: string
  onSurface: string
  onSurfaceVariant: string
  outline: string
  surfaceVariant: string
}

const { Primary, Secondary, Error, Grey, Common } = twakePalette

export const cozyPalette: { light: CozyPaletteScheme; dark: CozyPaletteScheme } = {
  light: {
    primary: Primary[600],
    primaryContainer: Primary[200],
    secondary: Secondary[600],
    error: Error[600],
    background: Grey[100],
    surface: Common.white,
    onSurface: Grey[900],
    onSurfaceVariant: Grey.A700,
    outline: Grey[300],
    surfaceVariant: Grey[200]
  },
  dark: {
    primary: Primary[400],
    primaryContainer: Primary[800],
    secondary: Grey[400],
    error: Error[400],
    background: Grey.A400,
    surface: Grey[800],
    onSurface: Common.white,
    onSurfaceVariant: Grey[400],
    outline: Grey[700],
    surfaceVariant: Grey.A700
  }
}
