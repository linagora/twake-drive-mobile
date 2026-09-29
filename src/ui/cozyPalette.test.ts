import twakePalette from '@linagora/twake-css/palette.json'
import { cozyPalette } from './cozyPalette'

const isHex = (s: string) => /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(s)

test('light scheme suit le mode light de twake-mui', () => {
  expect(cozyPalette.light.primary).toBe(twakePalette.Primary[600])
  expect(cozyPalette.light.error).toBe(twakePalette.Error[600])
  expect(cozyPalette.light.background).toBe(twakePalette.Grey[100])
  expect(cozyPalette.light.surface).toBe(twakePalette.Common.white)
})

test('dark scheme suit le mode dark de twake-mui', () => {
  expect(cozyPalette.dark.primary).toBe(twakePalette.Primary[400])
  expect(cozyPalette.dark.error).toBe(twakePalette.Error[400])
  expect(cozyPalette.dark.background).toBe(twakePalette.Grey.A400)
  expect(cozyPalette.dark.surface).toBe(twakePalette.Grey[800])
})

test('tous les tokens light+dark sont des hex opaques', () => {
  for (const scheme of [cozyPalette.light, cozyPalette.dark]) {
    for (const value of Object.values(scheme)) {
      expect(isHex(value)).toBe(true)
    }
  }
})
