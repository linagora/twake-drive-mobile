import { SharingDoc, SharingMember, SharingRule } from '@/files/sharing'
import { FileSharingEntry } from './SharingProvider'

export type SharingType = 'two-way' | 'one-way'

const TWO_WAY: SharingType = 'two-way'
const ONE_WAY: SharingType = 'one-way'

const rules = (sharing: SharingDoc): SharingRule[] =>
  sharing.attributes?.rules ?? sharing.rules ?? []

const members = (sharing: SharingDoc): SharingMember[] =>
  sharing.attributes?.members ?? sharing.members ?? []

const isOwnerSharing = (sharing: SharingDoc): boolean =>
  !!(sharing.attributes?.owner ?? sharing.owner)

const isDriveSharing = (sharing: SharingDoc): boolean =>
  !!(sharing.attributes?.drive ?? sharing.drive)

const isOrgDriveSharing = (sharing: SharingDoc): boolean =>
  !!(sharing.attributes?.org_drive ?? sharing.org_drive)

const isOpenSharing = (sharing: SharingDoc): boolean =>
  (sharing.attributes?.open_sharing ?? sharing.open_sharing) === true

const ruleFor = (sharing: SharingDoc, docId: string): SharingRule | undefined =>
  rules(sharing).find(rule => (rule.values ?? []).includes(docId))

const memberForInstance = (sharing: SharingDoc, instanceUri: string): SharingMember | undefined =>
  members(sharing).find(
    member => !!member.instance && member.instance.toLowerCase() === instanceUri.toLowerCase()
  )

const directoryRuleType = (rule: SharingRule | undefined): SharingType =>
  rule?.update === 'sync' && rule.remove === 'sync' ? TWO_WAY : ONE_WAY

const fileRuleType = (rule: SharingRule | undefined): SharingType =>
  rule?.update === 'sync' && rule.remove === 'revoke' ? TWO_WAY : ONE_WAY

const documentRuleType = (sharing: SharingDoc, docId: string): SharingType => {
  const rule = ruleFor(sharing, docId)
  return directoryRuleType(rule) === TWO_WAY || fileRuleType(rule) === TWO_WAY ? TWO_WAY : ONE_WAY
}

/**
 * Sharing type of one document, mirroring cozy-sharing's `getSharingType`
 * (`packages/cozy-sharing/src/state.js`).
 */
export const sharingTypeFor = (
  sharing: SharingDoc,
  docId: string,
  instanceUri: string
): SharingType => {
  const ruleType = documentRuleType(sharing, docId)
  if (isOwnerSharing(sharing)) return ruleType

  const me = memberForInstance(sharing, instanceUri)
  if (!me) return ruleType
  if (me.read_only) return ONE_WAY
  if (isDriveSharing(sharing)) return TWO_WAY
  return ruleType
}

/**
 * Sharing type of a shared drive, mirroring cozy-sharing's
 * `getSharedDriveSharingType`. Inside a drive only the read_only flag of the
 * current member matters: every document follows the drive's own rule.
 */
export const sharedDriveSharingType = (
  sharing: SharingDoc | undefined,
  instanceUri: string
): SharingType | null => {
  if (!sharing) return null
  const me = memberForInstance(sharing, instanceUri)
  if (!me) return null
  return me.read_only ? ONE_WAY : TWO_WAY
}

export interface WriteAccessState {
  sharings: SharingDoc[]
  byId: Map<string, FileSharingEntry>
}

/**
 * Whether the instance may create inside `docId`, mirroring cozy-sharing's
 * `hasWriteAccess(docId, driveId)`. A document with no sharing of its own is
 * writable: that is how a subfolder of a shared folder is handled on the web.
 */
export const hasWriteAccess = (
  state: WriteAccessState,
  docId: string,
  driveId: string | undefined,
  instanceUri: string
): boolean => {
  if (driveId) {
    const drive = state.sharings.find(sharing => sharing._id === driveId)
    return sharedDriveSharingType(drive, instanceUri) === TWO_WAY
  }

  const entry = state.byId.get(docId)
  if (!entry?.sharing) return true
  if (entry.isOwner) return true
  return sharingTypeFor(entry.sharing, docId, instanceUri) === TWO_WAY
}

/**
 * Whether the instance may share `docId` further, mirroring cozy-sharing's
 * `canReshare`: a member who is not read-only, on a sharing that allows it
 * (`open_sharing`) or on a shared drive that is not an organisation's.
 */
export const canReshare = (
  state: WriteAccessState,
  docId: string,
  instanceUri: string
): boolean => {
  const sharing = state.byId.get(docId)?.sharing
  if (!sharing) return false
  const me = memberForInstance(sharing, instanceUri)
  if (!me || me.read_only) return false
  return isDriveSharing(sharing) ? !isOrgDriveSharing(sharing) : isOpenSharing(sharing)
}

/**
 * Whether the instance may leave the sharing of `docId`, mirroring
 * cozy-sharing's `canLeave`: everything but the drive of an organisation.
 */
export const canLeave = (state: WriteAccessState, docId: string): boolean => {
  const sharing = state.byId.get(docId)?.sharing
  return !!sharing && !isOrgDriveSharing(sharing)
}
