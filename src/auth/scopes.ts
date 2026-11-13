/**
 * OAuth scopes the client of Twake Drive Mobile registers with. The token
 * itself is asked for with `FLAGSHIP_SCOPES` (registerSession,
 * registerDirectSession), so the app reaches every doctype, the photo
 * albums included.
 *
 * Format reference (cozy-stack permissions):
 *   "<doctype>"                                   ALL verbs on the doctype
 *   "<doctype>:<verbs>"                           verbs = comma-separated
 *                                                 HTTP methods (GET, POST,
 *                                                 PUT, PATCH, DELETE) or ALL
 *   "<doctype>:<verbs>:<selector>:<values>"       restrict by attribute
 *
 * Compared with twake-drive-web's manifest.webapp, this list omits
 * io.cozy.photos.albums, io.cozy.konnectors, io.cozy.accounts, io.cozy.jobs,
 * io.cozy.triggers, io.cozy.ai.chat.*, cc.cozycloud.dacc_v2,
 * eu.mycozy.dacc_v2 and cc.cozycloud.errors. A session signed in with this
 * list only, before the flagship scope, reaches the photo albums once
 * certifyFlagship ran.
 */
export const APP_SCOPES: readonly string[] = [
  // Core file system: list, read, move, rename, delete, upload — all verbs.
  'io.cozy.files',
  // Files sub-doctypes (versions, qualifications). cozy-client touches these
  // when reading file history or applying labels.
  'io.cozy.files.*',
  // Cozy bar fetches the installed apps list (icons, badges).
  'io.cozy.apps:GET',
  // Share sheet: read existing sharings + create/revoke (needs all verbs).
  'io.cozy.sharings',
  // Contact autocomplete in the share sheet.
  'io.cozy.contacts:GET',
  'io.cozy.contacts.groups:GET',
  // Cozy bar reads instance settings (locale, public name, etc.).
  'io.cozy.settings:GET',
  // OAuth client revocation listener (checks whether our own client is still
  // active; if revoked from web, we sign the user out).
  'io.cozy.oauth.clients:GET',
  // Drive-specific settings (e.g. offline storage quota, feature flags
  // scoped to the drive app).
  'io.cozy.drive.settings',
  // Notes: the app creates one through this doctype, the way the web does,
  // and asks the stack where a note of a shared drive opens.
  'io.cozy.notes'
] as const

/**
 * Space-separated form for endpoints (e.g. /oidc/access_token) that expect a
 * single string rather than an array.
 */
export const APP_SCOPE_STRING: string = APP_SCOPES.join(' ')

/**
 * Scope of a flagship-certified client: full access, which is what the stack
 * requires before it hands out a session code. Asked for at login, and by
 * certifyFlagship when an editor opens in a session signed in without it.
 */
export const FLAGSHIP_SCOPES: readonly string[] = ['*'] as const
