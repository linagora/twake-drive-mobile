import { useContext, useMemo } from 'react'

import { SharingContext } from '@/sharing/SharingProvider'

interface SharedFileIdsState {
  /**
   * Mirrors the previous local-fetch hook's contract so callers can keep
   * branching on `'loading' | 'loaded'`. We don't surface a `'failed'` state
   * here anymore: the provider swallows fetch errors (and logs them) and
   * always transitions to `loaded`. Existing callers that branch on
   * `'failed'` will simply never see it from this source — that's fine,
   * the shared screen also relies on its own `filesByIdsQuery` for the
   * actual file-doc fetch which has its own failure path.
   */
  status: 'loading' | 'loaded'
  ids: string[]
  error: null
  refresh: () => void
}

/**
 * Read sharing-derived file IDs from the global `SharingProvider`. Replaces
 * the previous duplicate-fetching local hook so the shared screen and the
 * row badges share a single source of truth.
 */
export const useSharedFileIds = (): SharedFileIdsState => {
  const ctx = useContext(SharingContext)
  const ids = useMemo(() => Array.from(ctx.byId.keys()).sort(), [ctx.byId])
  return {
    status: ctx.loaded ? 'loaded' : 'loading',
    error: null,
    ids,
    refresh: ctx.refresh
  }
}
