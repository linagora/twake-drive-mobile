import type CozyClient from 'cozy-client'

const SHARINGS_DOCTYPE = 'io.cozy.sharings'

/** One sharing through which a recipient reaches the document. */
export interface RecipientSource {
  sharing_id: string
  root_id?: string
  root_name?: string
  /** `self` when the document is the shared root, `ancestor` when a parent is. */
  kind?: 'self' | 'ancestor' | string
  member_index: number
  read_only?: boolean
  /** False when the access cannot be revoked or changed from this document. */
  manageable?: boolean
}

/**
 * A person who can reach a document, direct access and inherited access folded
 * into one entry. Answered by `GET /sharings/recipients/:fileId` and its
 * shared-drive form `GET /sharings/drives/:driveId/recipients/:fileId`.
 */
export interface EffectiveRecipient {
  id?: string
  name?: string
  email?: string
  instance?: string
  status?: string
  read_only?: boolean
  can_edit_here?: boolean
  sources?: RecipientSource[]
}

/**
 * What a recipient row needs: who they are, and what an action would target.
 * Shared with the legacy members list so the rows stay one component.
 */
export interface RecipientView {
  key: string
  name?: string
  email?: string
  instance?: string
  status: string
  readOnly: boolean
  sharingId?: string
  memberIndex?: number
  manageable: boolean
  /** Folder the access comes from, when it is not this document's own share. */
  inheritedFrom?: string
}

interface EffectiveRecipientsApi {
  fetchEffectiveRecipients: (
    fileId: string,
    options?: { driveId?: string }
  ) => Promise<{ data?: EffectiveRecipient[] }>
}

/**
 * The source an action has to target: the document's own share when there is
 * one, otherwise the first ancestor share. Mirrors cozy-sharing's
 * `getBestSource`.
 */
export const bestSource = (recipient: EffectiveRecipient): RecipientSource | null => {
  const sources = recipient.sources ?? []
  return sources.find(source => source.kind === 'self') ?? sources[0] ?? null
}

/**
 * Shapes the stack's effective recipients for the share screen.
 *
 * The owner is dropped, as everywhere else in the app: they are not a recipient
 * anyone can act on. A recipient with no source is kept but cannot be managed,
 * since there is no sharing and member index to send the revocation to.
 */
export const toRecipientViews = (
  recipients: EffectiveRecipient[] | null | undefined
): RecipientView[] =>
  (recipients ?? [])
    .filter(recipient => recipient.status !== 'owner')
    .map((recipient, index) => {
      const source = bestSource(recipient)
      const inherited = !!source && source.kind === 'ancestor'
      return {
        key: source ? `${source.sharing_id}-${source.member_index}` : `recipient-${index}`,
        name: recipient.name,
        email: recipient.email,
        instance: recipient.instance,
        status: recipient.status ?? '',
        readOnly: recipient.read_only === true,
        sharingId: source?.sharing_id,
        memberIndex: source?.member_index,
        manageable: !!source && source.manageable !== false,
        inheritedFrom: inherited ? source?.root_name : undefined
      }
    })

/**
 * Everyone who can reach a document, the drive's own route when it lives in a
 * shared drive.
 */
export const fetchEffectiveRecipients = async (
  client: CozyClient,
  fileId: string,
  driveId?: string
): Promise<RecipientView[]> => {
  const collection = client.collection(SHARINGS_DOCTYPE) as unknown as EffectiveRecipientsApi
  const resp = await collection.fetchEffectiveRecipients(fileId, driveId ? { driveId } : {})
  return toRecipientViews(resp?.data)
}
