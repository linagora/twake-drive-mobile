/** What a screen reads off a cozy-client query to know where it stands. */
export interface QueryLoadingState {
  fetchStatus?: string
  /** Set by cozy-client once a fetch has answered, whatever it answered. */
  lastFetch?: number | null
}

/**
 * Whether a query has never answered yet.
 *
 * `fetchStatus` alone does not say that: it returns to `loading` on every
 * refetch, and a list that is empty then swaps its empty state for a spinner
 * each time the sync touches the folder. Same rule as cozy-client's
 * `isQueryLoading(q) && !hasQueryBeenLoaded(q)`, read off the query here
 * because the helpers live behind the package entry point that pulls in the
 * native auth module.
 */
export const isFirstLoad = (...queries: (QueryLoadingState | null | undefined)[]): boolean =>
  queries.some(
    query =>
      !!query &&
      (query.fetchStatus === 'loading' || query.fetchStatus === 'pending') &&
      !query.lastFetch
  )
