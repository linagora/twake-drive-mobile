jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: jest.fn()
}))
jest.mock('./searchDatabases', () => ({
  getSearchDatabases: jest.fn(),
  isReplicating: jest.fn()
}))
jest.mock('./fileNameIndex', () => ({
  ensureFileNameIndex: jest.fn(),
  searchFileNames: jest.fn()
}))
jest.mock('@/monitoring/crashReporting', () => ({ reportCaughtError: jest.fn() }))

import { renderHook, act, waitFor } from '@testing-library/react-native'
import { useClient } from 'cozy-client'

import { reportCaughtError } from '@/monitoring/crashReporting'

import { ensureFileNameIndex, searchFileNames } from './fileNameIndex'
import { getSearchDatabases, isReplicating } from './searchDatabases'
import { useFileSearch } from './useFileSearch'

const mockUseClient = useClient as jest.Mock
const mockDatabases = getSearchDatabases as jest.Mock
const mockEnsure = ensureFileNameIndex as jest.Mock
const mockReplicating = isReplicating as jest.Mock
const mockSearch = searchFileNames as jest.Mock
const mockReport = reportCaughtError as jest.Mock

const personal = { id: 'personal' }
const driveA = { id: 'drive-a' }

const hit = (name: string, rank = -1, id = name) => ({
  rank,
  doc: { _id: id, _type: 'io.cozy.files', name, type: 'file' as const }
})

beforeEach(() => {
  jest.clearAllMocks()
  mockUseClient.mockReturnValue({})
  mockDatabases.mockReturnValue([{ db: personal }])
  mockEnsure.mockResolvedValue(true)
  mockReplicating.mockReturnValue(false)
  mockSearch.mockResolvedValue([])
})

describe('useFileSearch', () => {
  it('is idle when disabled', () => {
    const { result } = renderHook(() => useFileSearch('report', false))
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toHaveLength(0)
    expect(mockSearch).not.toHaveBeenCalled()
  })

  it('is idle when client is null', () => {
    mockUseClient.mockReturnValue(null)
    const { result } = renderHook(() => useFileSearch('report', true))
    expect(result.current.status).toBe('idle')
  })

  it('is idle when enabled becomes false', async () => {
    mockSearch.mockResolvedValue([hit('report.pdf')])
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) => useFileSearch('report', enabled),
      { initialProps: { enabled: true } }
    )
    await waitFor(() => expect(result.current.status).toBe('success'))
    rerender({ enabled: false })
    expect(result.current.status).toBe('idle')
    expect(result.current.data).toHaveLength(0)
  })

  it('returns the hits of the personal drive', async () => {
    mockSearch.mockResolvedValue([hit('report.pdf')])
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(mockSearch).toHaveBeenCalledWith(personal, 'report', 100)
    expect(result.current.data.map(doc => doc.name)).toEqual(['report.pdf'])
    expect(result.current.data[0].driveId).toBeUndefined()
  })

  it('lets the index be created when no replication is running', async () => {
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(mockEnsure).toHaveBeenCalledWith(personal, { mayCreate: true })
  })

  it('does not let the index be created while a replication is running', async () => {
    mockReplicating.mockReturnValue(true)
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(mockEnsure).toHaveBeenCalledWith(personal, { mayCreate: false })
  })

  it('merges shared drive hits, tagged with their drive, best rank first then by name', async () => {
    mockDatabases.mockReturnValue([{ db: personal }, { db: driveA, driveId: 'a' }])
    mockSearch.mockImplementation(async (db: unknown) =>
      db === personal ? [hit('b.pdf', -1), hit('z.pdf', -3)] : [hit('a.pdf', -1)]
    )
    const { result } = renderHook(() => useFileSearch('pdf', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(doc => [doc.name, doc.driveId])).toEqual([
      ['z.pdf', undefined],
      ['a.pdf', 'a'],
      ['b.pdf', undefined]
    ])
  })

  it('caps the merged results at 100', async () => {
    mockDatabases.mockReturnValue([{ db: personal }, { db: driveA, driveId: 'a' }])
    mockSearch.mockImplementation(async (db: unknown) =>
      Array.from({ length: 80 }, (_, i) => hit(`f${i}`, -1, `${db === personal ? 'p' : 'a'}-${i}`))
    )
    const { result } = renderHook(() => useFileSearch('f', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data).toHaveLength(100)
  })

  it('skips a shared drive that fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockDatabases.mockReturnValue([{ db: personal }, { db: driveA, driveId: 'a' }])
    mockSearch.mockImplementation(async (db: unknown) => {
      if (db === driveA) throw new Error('locked')
      return [hit('report.pdf')]
    })
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(doc => doc.name)).toEqual(['report.pdf'])
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })

  it('is in error, unreported, when the personal drive is not ready', async () => {
    mockEnsure.mockResolvedValue(false)
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(mockSearch).not.toHaveBeenCalled()
    expect(result.current.data).toHaveLength(0)
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('skips silently a shared drive that is not ready', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    mockDatabases.mockReturnValue([{ db: personal }, { db: driveA, driveId: 'a' }])
    mockEnsure.mockImplementation(async (db: unknown) => db === personal)
    mockSearch.mockResolvedValue([hit('report.pdf')])
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    expect(result.current.data.map(doc => doc.name)).toEqual(['report.pdf'])
    expect(mockSearch).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
    expect(mockReport).not.toHaveBeenCalled()
    warn.mockRestore()
  })

  it('is in error, unreported, when there is no local database', async () => {
    mockDatabases.mockReturnValue([])
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect(mockReport).not.toHaveBeenCalled()
  })

  it('is in error and reports when the personal drive fails', async () => {
    mockEnsure.mockRejectedValue(new Error('no such module: fts5'))
    let isolatedHook: typeof useFileSearch = useFileSearch
    const react = jest.requireActual('react')
    jest.isolateModules(() => {
      jest.doMock('react', () => react)
      isolatedHook = (require('./useFileSearch') as typeof import('./useFileSearch')).useFileSearch
    })
    const { result } = renderHook(() => isolatedHook('report', true))
    await waitFor(() => expect(result.current.status).toBe('error'))
    expect((result.current.error as Error).message).toContain('fts5')
    expect(mockReport).toHaveBeenCalledTimes(1)
  })

  it('drops stale responses when the term changes mid-flight', async () => {
    let resolveFirst: (hits: unknown[]) => void = () => undefined
    mockSearch
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockResolvedValueOnce([hit('second.pdf')])
    const { result, rerender } = renderHook(
      ({ term }: { term: string }) => useFileSearch(term, true),
      { initialProps: { term: 'first' } }
    )
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(1))
    rerender({ term: 'second' })
    await waitFor(() => expect(result.current.status).toBe('success'))
    await act(async () => {
      resolveFirst([hit('first.pdf')])
    })
    expect(result.current.data.map(doc => doc.name)).toEqual(['second.pdf'])
  })

  it('reload() re-triggers the search', async () => {
    const { result } = renderHook(() => useFileSearch('report', true))
    await waitFor(() => expect(result.current.status).toBe('success'))
    act(() => result.current.reload())
    await waitFor(() => expect(mockSearch).toHaveBeenCalledTimes(2))
  })
})
