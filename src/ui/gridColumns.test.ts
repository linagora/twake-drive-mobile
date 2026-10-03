import { gridColumnsForWidth } from './gridColumns'

describe('gridColumnsForWidth', () => {
  it('keeps three columns on a phone in portrait', () => {
    expect(gridColumnsForWidth(393)).toBe(3)
  })

  it('never drops below three, however narrow the screen', () => {
    expect(gridColumnsForWidth(320)).toBe(3)
    expect(gridColumnsForWidth(100)).toBe(3)
  })

  // Rotating used to leave the three portrait columns stretched across the
  // long edge, each tile adrift from its own action menu.
  it('adds columns when the screen gets wider', () => {
    expect(gridColumnsForWidth(852)).toBe(6)
    expect(gridColumnsForWidth(1024)).toBe(7)
  })
})
