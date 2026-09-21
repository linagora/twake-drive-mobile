import { isOurRedirect } from '@/auth/redirectUri'

/**
 * Where a link handed to the app by the OS lands.
 *
 * The end of the OAuth dance is consumed by the deep-link listener of the
 * login flow, not by a route: whichever shape it arrives in, the app belongs
 * on the drive rather than on a route named after the callback.
 */
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (isOurRedirect(path)) return '/(drive)/files'
    if (path.includes('dataUrl=')) return '/(drive)/files'
    return path
  } catch {
    return '/(drive)/files'
  }
}
