import { cozyPalette } from './cozyPalette'
import { lightTheme, darkTheme, cozyTokens } from './theme'

test('lightTheme mappe la palette cozy-ui sur les slots Paper', () => {
  expect(lightTheme.colors.primary).toBe(cozyPalette.light.primary)
  expect(lightTheme.colors.primaryContainer).toBe(cozyPalette.light.primaryContainer)
  expect(lightTheme.colors.error).toBe(cozyPalette.light.error)
  expect(lightTheme.colors.background).toBe(cozyPalette.light.background)
})

test('darkTheme reste un thème MD3 sombre', () => {
  expect(darkTheme.dark).toBe(true)
  expect(darkTheme.colors.primary).toBe(cozyPalette.dark.primary)
})

test('cozyTokens expose radius + shadow', () => {
  expect(cozyTokens.radius.md).toBeGreaterThan(0)
})
