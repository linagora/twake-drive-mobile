/**
 * The folder the picker was showing before the current one, or undefined when
 * the current one is where it started.
 */
export const previousFolderId = (
  pathSegments: string[],
  startFolderId: string
): string | undefined => {
  if (pathSegments.length > 1) return pathSegments[pathSegments.length - 2]
  if (pathSegments.length === 1) return startFolderId
  return undefined
}
