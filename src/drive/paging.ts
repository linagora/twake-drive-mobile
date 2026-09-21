interface PagedQuery {
  hasMore?: boolean
  isFetching?: boolean | null
  fetchMore?: unknown
}

/** Ask a paginated query for its next page, when it has one and is idle. */
export const fetchNextPage = (query: PagedQuery): void => {
  if (query.hasMore !== true) return
  if (query.isFetching === true) return
  if (typeof query.fetchMore !== 'function') return
  void (query.fetchMore as () => unknown)()
}
