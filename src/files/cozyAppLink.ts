import CozyClient from 'cozy-client'

interface SessionCodeResponse {
  session_code?: string
}

/**
 * Builds a URL into a cozy-installed web app (drive, notes, ...) with an
 * embedded session_code so the resulting WebView can render the app's UI
 * already authenticated. Uses the flat subdomain pattern
 * `<instance>-<slug>.<rest>` matching the user's stack hosting.
 */
export const buildCozyAppUrl = (
  stackUri: string,
  slug: string,
  sessionCode: string,
  hash: string
): string => {
  const url = new URL(stackUri)
  const [instance, ...rest] = url.host.split('.')
  const appHost = `${instance}-${slug}.${rest.join('.')}`
  const params = new URLSearchParams({ session_code: sessionCode })
  const normalizedHash = hash.startsWith('#') ? hash : `#${hash}`
  return `${url.protocol}//${appHost}/?${params.toString()}${normalizedHash}`
}

/**
 * Splits an instance host into its instance label and parent domain.
 * `mmaudet.twake.linagora.com` -> `['mmaudet', 'twake.linagora.com']`.
 */
const splitInstanceHost = (host: string): [string, string] => {
  const [instance, ...rest] = host.split('.')
  return [instance, rest.join('.')]
}

/**
 * Whether a URL belongs to the signed-in instance.
 *
 * cozy apps are served from flat subdomains of the instance
 * (`<instance>-<slug>.<parent>`, see buildCozyAppUrl), so the set of legitimate
 * origins is derivable from the session's own stack URI — there is nothing to
 * hardcode, and it follows the user to whichever instance they sign into.
 *
 * Deliberately scoped to the instance rather than the parent domain: on a
 * multi-tenant host, a neighbouring tenant is not us.
 */
export const isInstanceUrl = (stackUri: string, candidate: string): boolean => {
  let stack: URL
  let url: URL
  try {
    stack = new URL(stackUri)
    url = new URL(candidate)
  } catch {
    return false
  }
  if (url.protocol !== stack.protocol) return false
  if (url.host === stack.host) return true
  const [instance, parent] = splitInstanceHost(stack.host)
  // A single-label host (localhost, an IP) has no app subdomains to allow.
  if (!parent) return false
  return url.host.startsWith(`${instance}-`) && url.host.endsWith(`.${parent}`)
}

/**
 * originWhitelist patterns for a WebView bound to the signed-in instance:
 * the stack itself plus its flat app subdomains.
 */
export const instanceOriginWhitelist = (stackUri: string): string[] => {
  try {
    const stack = new URL(stackUri)
    const [instance, parent] = splitInstanceHost(stack.host)
    const origins = [`${stack.protocol}//${stack.host}`]
    if (parent) origins.push(`${stack.protocol}//${instance}-*.${parent}`)
    return origins
  } catch {
    // Never fall back to '*': an unparseable URI must not open the WebView up.
    return []
  }
}

/**
 * Calls fetchSessionCode on the cozy-stack client and returns the resulting
 * one-shot code. Throws if the session_code couldn't be obtained.
 */
export const getSessionCode = async (client: CozyClient): Promise<string> => {
  const stackClient = client.getStackClient()
  const fetchSessionCode = (
    stackClient as unknown as { fetchSessionCode?: () => Promise<SessionCodeResponse> }
  ).fetchSessionCode
  if (typeof fetchSessionCode !== 'function') {
    throw new Error('cozy-stack client does not expose fetchSessionCode')
  }
  const resp = await fetchSessionCode.call(stackClient)
  const code = resp?.session_code
  if (!code) throw new Error('Could not obtain session code from cozy stack')
  return code
}
