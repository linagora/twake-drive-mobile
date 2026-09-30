import flag from 'cozy-flags'

/**
 * Each local viewer ships behind its own flag, so a type can be turned on once
 * its renderer is good enough without waiting for the others.
 */
export const VIEWER_FLAGS = {
  markdown: 'drive.mobile.viewer.markdown.enabled',
  note: 'drive.mobile.viewer.note.enabled',
  docsNote: 'drive.mobile.viewer.docs-note.enabled',
  excalidraw: 'drive.mobile.viewer.excalidraw.enabled',
  office: 'drive.mobile.viewer.office.enabled'
} as const

export const OFFICE_FLAGS = {
  touchScreen: 'drive.office.touchScreen.enabled',
  legacy: 'drive.onlyoffice.enabled'
} as const

/** Mirrors twake-drive's isOfficeEnabled on a touch screen. */
export const officeEnabledFrom = (touchScreen: unknown, legacy: unknown): boolean => {
  if (touchScreen !== null && touchScreen !== undefined) return !!touchScreen
  return !!legacy
}

export const isOfficeEnabled = (): boolean =>
  officeEnabledFrom(flag(OFFICE_FLAGS.touchScreen), flag(OFFICE_FLAGS.legacy))

export type ViewerKind = keyof typeof VIEWER_FLAGS

/**
 * Off unless the instance says otherwise: a viewer is opt-in until it ships,
 * in every build, so what a developer sees is what a user gets.
 */
export const isViewerEnabled = (kind: ViewerKind): boolean => flag(VIEWER_FLAGS[kind]) === true
