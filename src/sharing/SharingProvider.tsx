import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState
} from 'react'
import { useClient } from 'cozy-client'

import { PublicLinkPermission, SharingDoc, SharingMember } from '@/files/sharing'

/**
 * Per-file aggregated sharing entry. Mirrors what cozy-sharing's
 * SharingProvider builds in `byDocId`: which sharing the file belongs to
 * (if any), whether the current instance owns it, whether a public link is
 * active, and the current recipient list.
 */
export interface FileSharingEntry {
  sharing?: SharingDoc
  isOwner: boolean
  hasLink: boolean
  recipients: SharingMember[]
}

/**
 * Public, UI-friendly view of an entry. Anything that's null/undefined means
 * "no sharing for this file" — components should render the unshared state.
 */
export interface FileSharingStatus {
  isShared: boolean
  isOwner: boolean
  hasLink: boolean
  recipientCount: number
}

interface ContextValue {
  loaded: boolean
  byId: Map<string, FileSharingEntry>
  refresh: () => void
}

export const SharingContext = createContext<ContextValue>({
  loaded: false,
  byId: new Map(),
  refresh: () => {}
})

const sharingFilesIds = (s: SharingDoc): string[] => {
  const rules = s.attributes?.rules ?? s.rules ?? []
  return rules
    .filter(r => !r.doctype || r.doctype === 'io.cozy.files')
    .flatMap(r => r.values ?? [])
}

const linkFilesIds = (p: PublicLinkPermission): string[] => {
  const perms = p.attributes?.permissions ?? p.permissions ?? {}
  return Object.values(perms).flatMap(v => v.values ?? [])
}

const sharingMembers = (s: SharingDoc): SharingMember[] =>
  s.attributes?.members ?? s.members ?? []

const sharingOwner = (s: SharingDoc): boolean | undefined =>
  s.attributes?.owner ?? s.owner

/**
 * Pure builder used by both the provider and its tests. Folds the two
 * server responses into a single `Map<fileId, FileSharingEntry>`.
 *
 * - Sharings whose `active === false` are skipped (mirrors cozy-sharing).
 * - For sharings, `isOwner` becomes true if ANY active sharing for this file
 *   has the owner flag (a file can in theory appear in multiple sharings).
 * - The first non-empty recipient list wins; we don't merge across sharings.
 * - Public-link permissions only contribute `hasLink`.
 */
export const buildByIdMap = (
  sharings: SharingDoc[],
  perms: PublicLinkPermission[]
): Map<string, FileSharingEntry> => {
  const map = new Map<string, FileSharingEntry>()

  for (const s of sharings) {
    if (s.attributes?.active === false) continue
    const owner = !!sharingOwner(s)
    const recipients = sharingMembers(s).filter(m => m.status !== 'owner')
    for (const fid of sharingFilesIds(s)) {
      if (!fid) continue
      const existing = map.get(fid) ?? { isOwner: false, hasLink: false, recipients: [] }
      map.set(fid, {
        sharing: existing.sharing ?? s,
        isOwner: existing.isOwner || owner,
        hasLink: existing.hasLink,
        recipients: existing.recipients.length > 0 ? existing.recipients : recipients
      })
    }
  }

  for (const p of perms) {
    for (const fid of linkFilesIds(p)) {
      if (!fid) continue
      const existing = map.get(fid) ?? { isOwner: false, hasLink: false, recipients: [] }
      map.set(fid, { ...existing, hasLink: true })
    }
  }

  return map
}

/**
 * Project an entry into the public status view. Returns null when there is
 * no entry — components branch on null to skip rendering.
 */
export const entryToStatus = (entry: FileSharingEntry | undefined): FileSharingStatus | null => {
  if (!entry) return null
  const isShared = !!entry.sharing || entry.hasLink
  if (!isShared) return null
  return {
    isShared,
    isOwner: entry.isOwner,
    hasLink: entry.hasLink,
    recipientCount: entry.recipients.length
  }
}

interface SharingsCollectionApi {
  findByDoctype: (
    doctype: string,
    options?: { withSharedDocs?: boolean }
  ) => Promise<{ data: SharingDoc[] }>
}

interface PermissionsCollectionApi {
  findLinksByDoctype: (doctype: string) => Promise<{ data: PublicLinkPermission[] }>
}

export const SharingProvider = ({ children }: { children: React.ReactNode }) => {
  const client = useClient()
  const [byId, setById] = useState<Map<string, FileSharingEntry>>(new Map())
  const [loaded, setLoaded] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!client) return
    let cancelled = false

    const run = async () => {
      try {
        const sharingCol = client.collection(
          'io.cozy.sharings'
        ) as unknown as SharingsCollectionApi
        const permCol = client.collection(
          'io.cozy.permissions'
        ) as unknown as PermissionsCollectionApi
        const [sharingsResp, permsResp] = await Promise.all([
          sharingCol.findByDoctype('io.cozy.files', { withSharedDocs: false }),
          permCol.findLinksByDoctype('io.cozy.files')
        ])
        if (cancelled) return

        const map = buildByIdMap(sharingsResp.data ?? [], permsResp.data ?? [])
        setById(map)
        setLoaded(true)
      } catch (e) {
        console.error('[SharingProvider] load failed', e)
        if (!cancelled) setLoaded(true)
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [client, refreshTick])

  const refresh = useCallback(() => setRefreshTick(t => t + 1), [])

  const value = useMemo<ContextValue>(() => ({ loaded, byId, refresh }), [loaded, byId, refresh])

  return <SharingContext.Provider value={value}>{children}</SharingContext.Provider>
}

/**
 * Read-side hook for components that just need to know whether a file is
 * shared. Returns null when the file has no entry — render the unshared
 * state in that case.
 */
export const useFileSharingStatus = (fileId: string | undefined): FileSharingStatus | null => {
  const ctx = useContext(SharingContext)
  if (!fileId) return null
  return entryToStatus(ctx.byId.get(fileId))
}

/**
 * Returns a stable function the ShareSheet can call after mutations to ask
 * the provider to re-fetch and rebuild its map.
 */
export const useRefreshSharings = (): (() => void) => useContext(SharingContext).refresh
