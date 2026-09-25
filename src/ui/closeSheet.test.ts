import { closeSheet, SheetRouter } from './closeSheet'

const makeRouter = (
  overrides: Partial<SheetRouter> = {}
): SheetRouter & {
  calls: string[]
} => {
  const calls: string[] = []
  return {
    calls,
    dismiss: () => calls.push('dismiss'),
    dismissAll: () => calls.push('dismissAll'),
    canDismiss: () => true,
    canGoBack: () => true,
    back: () => calls.push('back'),
    ...overrides
  }
}

describe('closeSheet', () => {
  // Drilling into folders pushes onto the nested stack; a single pop would
  // only walk one level back up and leave the sheet open.
  it('empties the nested stack before leaving the sheet', () => {
    const router = makeRouter()
    closeSheet(router)
    expect(router.calls).toEqual(['dismissAll', 'dismiss'])
  })

  it('falls back to back() when the sheet cannot be dismissed', () => {
    const router = makeRouter({ canDismiss: () => false })
    closeSheet(router)
    expect(router.calls).toEqual(['back'])
  })

  it('does nothing when there is nowhere to go', () => {
    const router = makeRouter({ canDismiss: () => false, canGoBack: () => false })
    closeSheet(router)
    expect(router.calls).toEqual([])
  })
})
