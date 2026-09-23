import { dismissModal } from './dismissModal'

// A move that walked into a folder left the sheet open over the drive: the
// folder had been pushed onto the sheet's own stack, and one dismiss only
// popped that (found by the Android e2e run).
describe('dismissModal', () => {
  it('drops what the sheet pushed, then the sheet', () => {
    const order: string[] = []
    const router = {
      canDismiss: () => true,
      dismissAll: () => order.push('dismissAll'),
      dismiss: () => order.push('dismiss'),
      canGoBack: () => true,
      back: () => order.push('back')
    }

    dismissModal(router)

    expect(order).toEqual(['dismissAll', 'dismiss'])
  })

  it('goes back when there is nothing to dismiss', () => {
    const back = jest.fn()
    const dismiss = jest.fn()

    dismissModal({
      canDismiss: () => false,
      dismiss,
      dismissAll: jest.fn(),
      canGoBack: () => true,
      back
    })

    expect(dismiss).not.toHaveBeenCalled()
    expect(back).toHaveBeenCalled()
  })

  it('does nothing rather than throw when the stack is empty', () => {
    const router = { canDismiss: () => false, canGoBack: () => false, back: jest.fn() }

    expect(() => dismissModal(router)).not.toThrow()
    expect(router.back).not.toHaveBeenCalled()
  })

  it('still dismisses on a router that has no dismissAll', () => {
    const dismiss = jest.fn()

    dismissModal({ canDismiss: () => true, dismiss, canGoBack: () => true, back: jest.fn() })

    expect(dismiss).toHaveBeenCalled()
  })
})
