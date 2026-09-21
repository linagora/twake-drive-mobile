import { fetchNextPage } from './paging'

describe('fetchNextPage', () => {
  it('leaves a query that has not landed in the store alone', () => {
    const fetchMore = jest.fn()
    fetchNextPage({ hasMore: false, isFetching: null, fetchMore })
    expect(fetchMore).not.toHaveBeenCalled()
  })

  it('leaves a query with no further page alone', () => {
    const fetchMore = jest.fn()
    fetchNextPage({ hasMore: false, isFetching: false, fetchMore })
    expect(fetchMore).not.toHaveBeenCalled()
  })

  it('waits for the page in flight', () => {
    const fetchMore = jest.fn()
    fetchNextPage({ hasMore: true, isFetching: true, fetchMore })
    expect(fetchMore).not.toHaveBeenCalled()
  })

  it('fetches the next page of an idle query that has one', () => {
    const fetchMore = jest.fn().mockResolvedValue(undefined)
    fetchNextPage({ hasMore: true, isFetching: false, fetchMore })
    expect(fetchMore).toHaveBeenCalledTimes(1)
  })
})
