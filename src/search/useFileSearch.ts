import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import { FileQueryResult } from '@/client/queries'
import { reportCaughtError } from '@/monitoring/crashReporting'

import { ensureFileNameIndex, FileNameHit, searchFileNames } from './fileNameIndex'
import { getSearchDatabases, isReplicating, SearchDatabase } from './searchDatabases'

export type SearchStatus = 'idle' | 'loading' | 'indexing' | 'success' | 'error'

export type SearchResult = FileQueryResult & { driveId?: string }

export interface FileSearchState {
  status: SearchStatus
  data: SearchResult[]
  error: unknown
  reload: () => void
}

const FILE_SEARCH_RESULT_LIMIT = 100

const INDEXING_RETRY_MS = 2000

interface RankedResult {
  doc: SearchResult
  rank: number
}

class SearchUnavailableError extends Error {}

const reportedMessages = new Set<string>()

const reportOncePerMessage = (error: unknown): void => {
  const reportable = error instanceof Error ? error : new Error(String(error))
  if (reportedMessages.has(reportable.message)) return
  reportedMessages.add(reportable.message)
  reportCaughtError(reportable, { area: 'search' })
}

const searchDatabase = async (
  { db, driveId }: SearchDatabase,
  term: string
): Promise<RankedResult[]> => {
  try {
    if (!(await ensureFileNameIndex(db, { mayCreate: !isReplicating() }))) {
      if (!driveId) throw new SearchUnavailableError('search: the personal drive is not ready')
      return []
    }
    const hits: FileNameHit[] = await searchFileNames(db, term, FILE_SEARCH_RESULT_LIMIT)
    return hits.map(({ doc, rank }) => ({ doc: driveId ? { ...doc, driveId } : doc, rank }))
  } catch (error) {
    if (!driveId) throw error
    console.warn('[search] shared drive skipped', driveId, error)
    return []
  }
}

export function useFileSearch(term: string, enabled: boolean): FileSearchState {
  const client = useClient()
  const [state, setState] = useState<{
    status: SearchStatus
    data: SearchResult[]
    error: unknown
  }>({
    status: 'idle',
    data: [],
    error: null
  })
  const [reloadToken, setReloadToken] = useState(0)
  const reqId = useRef(0)
  const reload = useCallback(() => setReloadToken(token => token + 1), [])

  useEffect(() => {
    if (!client || !enabled) {
      reqId.current++
      setState({ status: 'idle', data: [], error: null })
      return
    }

    const id = ++reqId.current
    setState(prev => ({ status: 'loading', data: prev.data, error: null }))

    const run = async (): Promise<void> => {
      const databases = getSearchDatabases(client)
      if (databases.length === 0) throw new SearchUnavailableError('search: no local database')
      const perDatabase = await Promise.all(
        databases.map(database => searchDatabase(database, term))
      )
      if (id !== reqId.current) return
      const data = perDatabase
        .flat()
        .sort((a, b) => a.rank - b.rank || a.doc.name.localeCompare(b.doc.name))
        .slice(0, FILE_SEARCH_RESULT_LIMIT)
        .map(result => result.doc)
      setState({ status: 'success', data, error: null })
    }

    let cancelled = false
    let retry: ReturnType<typeof setTimeout> | undefined
    const attempt = (): void => {
      run().catch((err: unknown) => {
        if (cancelled || id !== reqId.current) return
        if (err instanceof SearchUnavailableError) {
          setState({ status: 'indexing', data: [], error: null })
          retry = setTimeout(attempt, INDEXING_RETRY_MS)
          return
        }
        reportOncePerMessage(err)
        setState({ status: 'error', data: [], error: err })
      })
    }
    attempt()
    return () => {
      cancelled = true
      clearTimeout(retry)
    }
  }, [client, term, enabled, reloadToken])

  return { ...state, reload }
}
