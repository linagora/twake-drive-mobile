export interface DismissableRouter {
  dismiss?: () => void
  dismissAll?: () => void
  canDismiss?: () => boolean
  canGoBack: () => boolean
  back: () => void
}

/**
 * Closes a modal that carries a stack of its own.
 *
 * The move and import sheets push a screen every time the user walks into a
 * folder, so a single `dismiss()` only pops that screen and leaves the sheet
 * on top of the drive. Everything the sheet pushed goes first, then the sheet.
 */
export const dismissModal = (router: DismissableRouter): void => {
  const canDismiss = (): boolean => router.canDismiss?.() === true
  if (canDismiss() && typeof router.dismissAll === 'function') router.dismissAll()
  if (canDismiss() && typeof router.dismiss === 'function') {
    router.dismiss()
    return
  }
  if (router.canGoBack()) router.back()
}
