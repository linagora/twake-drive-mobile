import { isFirstLoad } from './queryLoading'

describe('isFirstLoad', () => {
  it('is true while a query that never answered is fetching', () => {
    expect(isFirstLoad({ fetchStatus: 'loading' })).toBe(true)
    expect(isFirstLoad({ fetchStatus: 'pending' })).toBe(true)
  })

  it('is false once the query has answered, even while it fetches again', () => {
    expect(isFirstLoad({ fetchStatus: 'loading', lastFetch: 1700000000000 })).toBe(false)
  })

  it('is false when nothing is fetching', () => {
    expect(isFirstLoad({ fetchStatus: 'loaded', lastFetch: 1700000000000 })).toBe(false)
    expect(isFirstLoad({ fetchStatus: 'failed' })).toBe(false)
  })

  it('takes several queries and reports the one still waiting', () => {
    const answered = { fetchStatus: 'loaded', lastFetch: 1 }
    const waiting = { fetchStatus: 'loading' }
    expect(isFirstLoad(answered, waiting)).toBe(true)
    expect(isFirstLoad(answered, { fetchStatus: 'loading', lastFetch: 2 })).toBe(false)
  })

  it('ignores queries a screen has not enabled', () => {
    expect(isFirstLoad(null, undefined)).toBe(false)
  })
})
