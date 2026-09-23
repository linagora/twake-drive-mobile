export interface DriveRouter {
  canDismiss: () => boolean
  dismissAll: () => void
  replace: (href: string) => void
}

export const DRIVE_HOME = '/(drive)/files'

/**
 * Leaves the auth screens behind for good.
 *
 * `replace` only swaps the screen on top, so a login reached from the welcome
 * screen left that screen underneath and the system Back went back to it
 * (#272). Dropping the auth stack first makes the drive the only thing left.
 */
export const enterDrive = (router: DriveRouter): void => {
  if (router.canDismiss()) router.dismissAll()
  router.replace(DRIVE_HOME)
}
