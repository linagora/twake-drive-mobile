import { useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

interface SharingRule {
  values?: string[]
}

interface SharingDoc {
  _id: string
  attributes?: {
    rules?: SharingRule[]
    active?: boolean
    shortcut_id?: string
  }
  rules?: SharingRule[]
}

interface PermissionEntry {
  values?: string[]
}

interface PermissionDoc {
  _id: string
  attributes?: {
    permissions?: Record<string, PermissionEntry>
  }
}

interface State {
  status: 'loading' | 'failed' | 'loaded'
  ids: string[]
  error: unknown
}

const getSharingDocIds = (sharing: SharingDoc): string[] => {
  const rules = sharing.rules ?? sharing.attributes?.rules ?? []
  const docs = rules.flatMap(r => r.values ?? [])
  if (sharing.attributes?.shortcut_id) docs.push(sharing.attributes.shortcut_id)
  return docs
}

const getPermissionDocIds = (perm: PermissionDoc): string[] => {
  const perms = perm.attributes?.permissions ?? {}
  return Object.keys(perms).flatMap(k => perms[k].values ?? [])
}

export const useSharedFileIds = () => {
  const client = useClient()
  const [state, setState] = useState<State>({ status: 'loading', ids: [], error: null })
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!client) return
    let cancelled = false

    const run = async () => {
      try {
        setState(prev => ({ ...prev, status: 'loading' }))
        const sharingCol = client.collection('io.cozy.sharings')
        const permissionCol = client.collection('io.cozy.permissions')
        const [sharingsResp, permsResp] = await Promise.all([
          sharingCol.findByDoctype('io.cozy.files', { withSharedDocs: false }) as Promise<{
            data: SharingDoc[]
          }>,
          permissionCol.findLinksByDoctype('io.cozy.files') as Promise<{ data: PermissionDoc[] }>
        ])

        const activeSharings = (sharingsResp.data ?? []).filter(s => s.attributes?.active === true)
        const sharingIds = activeSharings.flatMap(getSharingDocIds)
        const permissionIds = (permsResp.data ?? []).flatMap(getPermissionDocIds)

        const ids = Array.from(new Set([...sharingIds, ...permissionIds])).filter(Boolean)
        console.log(
          '[useSharedFileIds] sharings:',
          activeSharings.length,
          '/',
          sharingsResp.data?.length ?? 0,
          'perms:',
          permsResp.data?.length ?? 0,
          'fileIds:',
          ids.length
        )
        if (!cancelled) setState({ status: 'loaded', ids, error: null })
      } catch (e) {
        console.error('[useSharedFileIds] failed', e)
        if (!cancelled) setState({ status: 'failed', ids: [], error: e })
      }
    }

    void run()
    return () => {
      cancelled = true
    }
  }, [client, refreshTick])

  const refresh = () => setRefreshTick(t => t + 1)

  return { ...state, refresh }
}
