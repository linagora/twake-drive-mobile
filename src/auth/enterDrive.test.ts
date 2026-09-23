import { DRIVE_HOME, enterDrive } from './enterDrive'

const routerWith = (canDismiss: boolean) => ({
  canDismiss: jest.fn(() => canDismiss),
  dismissAll: jest.fn(),
  replace: jest.fn()
})

describe('enterDrive', () => {
  // Login reached from the welcome screen left it underneath, so the system
  // Back went back to Sign up / Log in instead of leaving the app (#272).
  it('drops the auth screens it was reached through', () => {
    const router = routerWith(true)

    enterDrive(router)

    expect(router.dismissAll).toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith(DRIVE_HOME)
  })

  it('dismisses nothing when the login screen is the only one', () => {
    const router = routerWith(false)

    enterDrive(router)

    expect(router.dismissAll).not.toHaveBeenCalled()
    expect(router.replace).toHaveBeenCalledWith(DRIVE_HOME)
  })

  it('leaves the auth stack before replacing, not after', () => {
    const order: string[] = []
    const router = {
      canDismiss: () => true,
      dismissAll: () => order.push('dismissAll'),
      replace: () => order.push('replace')
    }

    enterDrive(router)

    expect(order).toEqual(['dismissAll', 'replace'])
  })
})
