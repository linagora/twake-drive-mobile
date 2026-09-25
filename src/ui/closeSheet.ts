export interface SheetRouter {
  dismiss?: (count?: number) => void
  dismissAll?: () => void
  canDismiss?: () => boolean
  canGoBack: () => boolean
  back: () => void
}

/**
 * Closes a pageSheet whose content is a nested stack.
 *
 * `dismiss()` pops a single route, so from a folder the user drilled into it
 * only walks one level back up and leaves the sheet open. The nested stack is
 * emptied first, then the pop that follows finds nothing left to pop there and
 * leaves the sheet itself.
 */
export const closeSheet = (router: SheetRouter): void => {
  if (router.canDismiss?.() === true) {
    router.dismissAll?.()
    router.dismiss?.()
    return
  }
  if (router.canGoBack()) router.back()
}
