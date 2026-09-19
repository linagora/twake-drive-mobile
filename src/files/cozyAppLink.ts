/**
 * Builds a URL into a cozy-installed web app (drive, notes, ...), on the flat
 * subdomain pattern `<instance>-<slug>.<rest>` matching the user's stack
 * hosting. The app is opened in the system browser, which carries the session
 * cookie, so the URL never has to carry a credential of its own.
 */
export const buildCozyAppUrl = (stackUri: string, slug: string, hash: string): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const appHost = `${instance}-${slug}.${rest.join('.')}`
  const normalizedHash = hash.startsWith('#') ? hash : `#${hash}`
  return `${url.protocol}//${appHost}/${normalizedHash}`
}
