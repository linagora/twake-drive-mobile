import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

// Doctype constants used throughout this module.
const FILES_DOCTYPE = 'io.cozy.files'
const SHARINGS_DOCTYPE = 'io.cozy.sharings'
const PERMISSIONS_DOCTYPE = 'io.cozy.permissions'
const CONTACTS_DOCTYPE = 'io.cozy.contacts'

// Verb sets for public links. Mirrors twake-drive web's
// `packages/cozy-sharing/src/components/ShareRestrictionModal/helpers.js`:
// readers get GET only, editors get GET/POST/PUT/PATCH (DELETE is intentionally
// excluded — same shape as the web ShareRestrictionModal/BoxEditingRights).
export const READ_ONLY_PERMS = ['GET'] as const
export const WRITE_PERMS = ['GET', 'POST', 'PUT', 'PATCH'] as const

export type LinkEditingRights = 'readOnly' | 'write'

// Sharing rule from `io.cozy.sharings`. The Cozy stack normalizer flattens
// `attributes` to the top level of the doc, so callers may see fields in
// either place — we read from `attributes` defensively.
export interface SharingRule {
  values?: string[]
  doctype?: string
  title?: string
  add?: string
  update?: string
  remove?: string
}

export interface SharingMember {
  status: 'owner' | 'pending' | 'ready' | 'revoked' | 'mail-not-sent' | 'seen' | string
  email?: string
  name?: string
  read_only?: boolean
  instance?: string
  public_name?: string
}

export interface SharingDoc {
  _id: string
  attributes?: {
    rules?: SharingRule[]
    members?: SharingMember[]
    active?: boolean
    owner?: boolean
    drive?: boolean
    /** The `.url` file that stands for the share on the recipient instance
     *  until it is accepted. */
    shortcut_id?: string
    description?: string
    created_at?: string
    updated_at?: string
  }
  // Sometimes the normalizer flattens these to top-level too.
  rules?: SharingRule[]
  members?: SharingMember[]
  owner?: boolean
  drive?: boolean
  shortcut_id?: string
  created_at?: string
  updated_at?: string
}

export interface PublicLinkPermission {
  _id: string
  id?: string
  attributes?: {
    codes?: Record<string, string>
    shortcodes?: Record<string, string>
    permissions?: Record<string, { type?: string; values?: string[]; verbs?: string[] }>
    created_at?: string
    updated_at?: string
  }
  // Normalizer also flattens these to top-level.
  codes?: Record<string, string>
  shortcodes?: Record<string, string>
  permissions?: Record<string, { type?: string; values?: string[]; verbs?: string[] }>
  created_at?: string
  updated_at?: string
}

interface SharingsCollectionApi {
  findByDoctype: (doctype: string) => Promise<{ data: SharingDoc[] }>
  get: (id: string) => Promise<{ data: SharingDoc }>
  create: (params: {
    document: { _id: string; _type: string; name?: string }
    description?: string
    recipients?: { _id: string; _type: string }[]
    readOnlyRecipients?: { _id: string; _type: string }[]
    openSharing?: boolean
    sharedDrive?: boolean
  }) => Promise<{ data: SharingDoc }>
  addRecipients: (params: {
    document: { _id: string }
    recipients?: { _id: string; _type: string }[]
    readOnlyRecipients?: { _id: string; _type: string }[]
  }) => Promise<{ data: SharingDoc }>
  revokeRecipient: (sharing: { _id: string }, index: number) => Promise<unknown>
  setReadOnly: (sharing: { _id: string }, index: number) => Promise<unknown>
  setReadWrite: (sharing: { _id: string }, index: number) => Promise<unknown>
  revokeSelf: (sharing: { _id: string }) => Promise<unknown>
  revokeAllRecipients: (sharing: { _id: string }) => Promise<unknown>
}

interface PermissionsCollectionApi {
  findLinksByDoctype: (doctype: string) => Promise<{ data: PublicLinkPermission[] }>
  createSharingLink: (
    document: { _id: string; _type: string },
    options?: { ttl?: string; password?: string; verbs?: string[]; tiny?: boolean }
  ) => Promise<{ data: PublicLinkPermission }>
  revokeSharingLink: (document: { _id: string; _type: string }) => Promise<unknown>
  fetchAllLinks: (document: {
    _id: string
    _type: string
  }) => Promise<{ data: PublicLinkPermission[] }>
}

interface ContactDoc {
  _id: string
  _type: string
  email?: { address: string; primary?: boolean }[]
}

interface ContactsCollectionApi {
  create: (doc: Partial<ContactDoc> & Record<string, unknown>) => Promise<{ data: ContactDoc }>
}

const getSharings = (client: CozyClient): SharingsCollectionApi =>
  client.collection(SHARINGS_DOCTYPE) as unknown as SharingsCollectionApi

const getPermissions = (client: CozyClient): PermissionsCollectionApi =>
  client.collection(PERMISSIONS_DOCTYPE) as unknown as PermissionsCollectionApi

const getContacts = (client: CozyClient): ContactsCollectionApi =>
  client.collection(CONTACTS_DOCTYPE) as unknown as ContactsCollectionApi

const sharingRules = (sharing: SharingDoc): SharingRule[] =>
  sharing.attributes?.rules ?? sharing.rules ?? []

const sharingMembers = (sharing: SharingDoc): SharingMember[] =>
  sharing.attributes?.members ?? sharing.members ?? []

const sharingOwnerFlag = (sharing: SharingDoc): boolean | undefined =>
  sharing.attributes?.owner ?? sharing.owner

const linkPermissionsMap = (
  permission: PublicLinkPermission
): Record<string, { type?: string; values?: string[]; verbs?: string[] }> =>
  permission.attributes?.permissions ?? permission.permissions ?? {}

const linkCodesMap = (permission: PublicLinkPermission): Record<string, string> =>
  permission.attributes?.codes ?? permission.codes ?? {}

const linkShortcodesMap = (permission: PublicLinkPermission): Record<string, string> =>
  permission.attributes?.shortcodes ?? permission.shortcodes ?? {}

const filesContains = (sharing: SharingDoc, fileId: string): boolean => {
  const rules = sharingRules(sharing)
  return rules.some(
    rule =>
      (rule.doctype === FILES_DOCTYPE || !rule.doctype) && (rule.values ?? []).includes(fileId)
  )
}

const linkContainsFile = (perm: PublicLinkPermission, fileId: string): boolean => {
  const perms = linkPermissionsMap(perm)
  return Object.values(perms).some(p => (p.values ?? []).includes(fileId))
}

/**
 * Find the sharing that includes a given file/folder for the current user.
 * Prefers a sharing where the user is the owner.
 *
 * A document inside a shared drive has no sharing of its own: the drive's one
 * is what carries its members, so `driveId` short-circuits the search the way
 * cozy-sharing's `share` resolves `getSharingById(document.driveId)`.
 */
export const findSharingForFile = async (
  client: CozyClient,
  fileId: string,
  driveId?: string
): Promise<SharingDoc | null> => {
  if (driveId) {
    const drive = await getSharings(client).get(driveId)
    return drive?.data ?? null
  }
  const resp = await getSharings(client).findByDoctype(FILES_DOCTYPE)
  const list = resp?.data ?? []
  const matching = list.filter(s => filesContains(s, fileId))
  if (matching.length === 0) return null
  const owned = matching.find(s => sharingOwnerFlag(s) === true)
  return owned ?? matching[0]
}

/**
 * Find the public link (io.cozy.permissions) that grants access to a file.
 */
export const findPublicLinkForFile = async (
  client: CozyClient,
  fileId: string
): Promise<PublicLinkPermission | null> => {
  const resp = await getPermissions(client).findLinksByDoctype(FILES_DOCTYPE)
  const list = resp?.data ?? []
  return list.find(p => linkContainsFile(p, fileId)) ?? null
}

/**
 * Build the public URL the recipient must visit for a public link.
 *
 * Mirrors the cozy-drive web pattern: the drive web app at
 * `<instance>-drive.<domain>/public?sharecode=<code>&id=<perm-id>`.
 *
 * Returns null if the permission has no usable code or the stack URI is
 * malformed.
 */
export const buildPublicLinkUrl = (
  stackUri: string,
  permission: PublicLinkPermission
): string | null => {
  // Mirror cozy-sharing's getShortcode() lookup order so we pick the same
  // value the web modal would: prefer shortcodes.email > shortcodes.code,
  // then fall back to codes.email > codes.code. The "email" key dates back
  // to share-by-link, the "code" key is what cozy-client uses by default.
  const shortcodes = linkShortcodesMap(permission)
  const codes = linkCodesMap(permission)
  const code = shortcodes.email ?? shortcodes.code ?? codes.email ?? codes.code ?? null
  if (!code) return null
  let url: URL
  try {
    url = new URL(stackUri)
  } catch {
    return null
  }
  const [instance, ...rest] = url.host.split('.')
  if (!instance || rest.length === 0) return null
  return `${url.protocol}//${instance}-drive.${rest.join('.')}/public?sharecode=${encodeURIComponent(code)}`
}

/**
 * Create a public link for a file or folder.
 *
 * `editingRights` controls the verb set granted by the link permission. The
 * default mirrors cozy-sharing web (`'readOnly'`) — callers that want an
 * editor link must opt in.
 */
export const createPublicLink = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory' },
  editingRights: LinkEditingRights = 'readOnly'
): Promise<PublicLinkPermission> => {
  const document = { _id: file._id, _type: FILES_DOCTYPE, type: file.type }
  const verbs = editingRights === 'write' ? [...WRITE_PERMS] : [...READ_ONLY_PERMS]
  // NB: do NOT pass `tiny: true`. The cozy-stack only mints a tiny shortcode
  // when the link also carries a short `ttl` (< 1h) — see PermissionCollection
  // .createSharingLink docs — so requesting `tiny` without a ttl makes the
  // stack reject the POST, which is why the "public link" toggle silently
  // failed. A public link must be permanent (no ttl), so we accept the long
  // sharecode; buildPublicLinkUrl falls back to `codes.code` for the URL.
  const result = await getPermissions(client).createSharingLink(document, { verbs })
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
  return result.data
}

/**
 * Derive the current editing rights from an existing public link permission.
 *
 * Mirrors cozy-sharing's `getSharingType`/`isReadOnly` heuristic: any verb
 * other than `'GET'` (POST/PUT/PATCH/DELETE/ALL) → editor; otherwise reader.
 * Missing permission, missing entries, or empty verb arrays default to
 * `'readOnly'` so we don't accidentally surface "Editor" for a half-loaded
 * permission doc.
 */
export const getLinkEditingRights = (
  permission: PublicLinkPermission | null | undefined
): LinkEditingRights => {
  if (!permission) return 'readOnly'
  const perms = permission.attributes?.permissions ?? permission.permissions ?? {}
  for (const entry of Object.values(perms)) {
    const verbs = entry.verbs ?? []
    if (verbs.some(v => v !== 'GET')) return 'write'
  }
  return 'readOnly'
}

/**
 * Revoke a public link for a file or folder.
 */
export const revokePublicLink = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory' }
): Promise<void> => {
  const document = { _id: file._id, _type: FILES_DOCTYPE, type: file.type }
  await getPermissions(client).revokeSharingLink(document)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Recipients of a sharing, owner excluded.
 */
export const getRecipients = (sharing: SharingDoc | null): SharingMember[] => {
  if (!sharing) return []
  return sharingMembers(sharing).filter(m => m.status !== 'owner')
}

/**
 * Create or fetch a contact-shaped object referencing an email.
 *
 * The cozy-stack-client's `addRecipients` and `create` only forward
 * `{ id, type }` (the `_id`/`_type`) of each recipient: it does NOT pass
 * the email through. Real-world usage therefore requires a contact doc
 * (io.cozy.contacts) with that email. We create a minimal one here. This
 * mirrors what cozy-sharing's web modal does internally.
 *
 * TODO: try to find an existing contact by email first to avoid creating
 *  duplicates. Doing so requires an index on `email.address` which the
 *  app does not currently configure.
 */
const createContactForEmail = async (
  client: CozyClient,
  email: string
): Promise<{ _id: string; _type: string }> => {
  const resp = await getContacts(client).create({
    email: [{ address: email, primary: true }]
  })
  const data = resp.data
  return { _id: data._id, _type: CONTACTS_DOCTYPE }
}

/** A person to share with: an email, and the address-book contact it came from. */
export interface RecipientInput {
  email: string
  contactId?: string
}

/**
 * Resolve the contact references for a batch of recipients. When the caller
 * already knows an existing contact (picked from the autocomplete or matched
 * by email in the address book) its id is reused: the stack can resolve it
 * immediately. Only without one do we mint a minimal contact from the raw
 * email (see createContactForEmail and its caveats).
 */
const recipientsRefs = (
  client: CozyClient,
  recipients: readonly RecipientInput[]
): Promise<{ _id: string; _type: string }[]> =>
  Promise.all(
    recipients.map(({ email, contactId }) =>
      contactId ? { _id: contactId, _type: CONTACTS_DOCTYPE } : createContactForEmail(client, email)
    )
  )

/**
 * Add recipients (by email) to an existing sharing, all with the same rights.
 */
export const addRecipients = async (
  client: CozyClient,
  sharing: SharingDoc,
  recipients: readonly RecipientInput[],
  readOnly: boolean
): Promise<void> => {
  const refs = await recipientsRefs(client, recipients)
  const args: Parameters<SharingsCollectionApi['addRecipients']>[0] = {
    document: { _id: sharing._id },
    recipients: readOnly ? [] : refs,
    readOnlyRecipients: readOnly ? refs : []
  }
  await getSharings(client).addRecipients(args)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Change what a member of a sharing may do, given its absolute index in that
 * sharing's members (see revokeSharingMember). Mirrors cozy-sharing's
 * PermissionTypeMenu: `POST` downgrades to read-only, `DELETE` on the same
 * route upgrades back to read-write.
 */
export const setMemberReadOnly = async (
  client: CozyClient,
  sharingId: string,
  memberIndex: number,
  readOnly: boolean
): Promise<void> => {
  const sharings = getSharings(client)
  await (readOnly
    ? sharings.setReadOnly({ _id: sharingId }, memberIndex)
    : sharings.setReadWrite({ _id: sharingId }, memberIndex))
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Revoke a member of a sharing given its index in that sharing's members.
 *
 * The index is the absolute one: `members` holds the owner at index 0, so a
 * position in the filtered list `getRecipients` returns has to go through
 * `absoluteMemberIndex` first. The effective-recipients route answers an
 * absolute index already, for inherited access as well as direct.
 */
export const revokeSharingMember = async (
  client: CozyClient,
  sharingId: string,
  memberIndex: number
): Promise<void> => {
  await getSharings(client).revokeRecipient({ _id: sharingId }, memberIndex)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
}

/**
 * Leave a shared drive somebody shared with us.
 *
 * The recipient counterpart of revoking a member: twake-drive web splits the
 * two the same way, `leaveSharedDrive` against `revokeSelf` for a recipient
 * and the share modal for the owner.
 */
export const leaveSharedDrive = async (client: CozyClient, driveId: string): Promise<void> => {
  await getSharings(client).revokeSelf({ _id: driveId })
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.files')
}

/**
 * Compute the absolute index in `members` for a recipient given its position
 * in the recipients-only array (what the UI displays).
 */
export const absoluteMemberIndex = (sharing: SharingDoc, recipientIndex: number): number => {
  const members = sharingMembers(sharing)
  let seen = -1
  for (let i = 0; i < members.length; i++) {
    if (members[i].status !== 'owner') {
      seen += 1
      if (seen === recipientIndex) return i
    }
  }
  return -1
}

/**
 * Create a new sharing for a file or folder with its initial recipients.
 *
 * `sharedDrive` makes it a shared drive rather than a cozy-to-cozy sharing:
 * cozy-stack-client's `create` then posts to `/sharings/drives`. That is what
 * twake-drive web does for every recipient it adds while
 * `drive.federated-shared-folder.enabled` is on, down to `openSharing: false`
 * (see cozy-sharing's FederatedFolderModal).
 */
export const createSharingForFile = async (
  client: CozyClient,
  file: { _id: string; type?: 'file' | 'directory'; name?: string },
  recipients: readonly RecipientInput[],
  readOnly: boolean,
  options: { sharedDrive?: boolean } = {}
): Promise<SharingDoc> => {
  const refs = await recipientsRefs(client, recipients)
  const document = {
    _id: file._id,
    _type: FILES_DOCTYPE,
    name: file.name,
    type: file.type
  }
  const args: Parameters<SharingsCollectionApi['create']>[0] = {
    document,
    description: file.name ?? 'Shared',
    recipients: readOnly ? [] : refs,
    readOnlyRecipients: readOnly ? refs : [],
    ...(options.sharedDrive ? { sharedDrive: true, openSharing: false } : {})
  }
  const resp = await getSharings(client).create(args)
  triggerPouchReplication(client, 'io.cozy.sharings')
  triggerPouchReplication(client, 'io.cozy.permissions')
  return resp.data
}
