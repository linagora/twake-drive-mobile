import { useCallback, useEffect, useRef, useState } from 'react'
import { useClient } from 'cozy-client'

import { FileQueryResult } from '@/client/queries'
import { reportCaughtError } from '@/monitoring/crashReporting'

import { ensureFileNameIndex, FileNameHit, searchFileNames } from './fileNameIndex'
import { getSearchDatabases, isReplicating, SearchDatabase } from './searchDatabases'

export type SearchStatus = 'idle' | 'loading' | 'success' | 'error'

export type SearchResult = FileQueryResult & { driveId?: string }

export interface FileSearchState {
  status: SearchStatus
  data: SearchResult[]
  error: unknown
  reload: () => void
}

const FILE_SEARCH_RESULT_LIMIT = 100

interface RankedResult {
  doc: SearchResult
  rank: number
}

class SearchUnavailableError extends Error {}

let reported = false

const reportOnce = (error: unknown): void => {
  if (error instanceof SearchUnavailableError) return
  if (reported) return
  reported = true
  reportCaughtError(error instanceof Error ? error : new Error(String(error)), {
    area: 'search'
  })
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

/**
 * File name search on the local replicas: the personal drive and every
 * replicated shared drive. Works offline and issues no network request.
 *
 * Out-of-order responses are dropped via a monotonic request id so fast typing
 * never leaves a stale result on screen.
 *
 * Idle when `enabled` is false (caller sets this when the search term is empty).
 */
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

    run().catch((err: unknown) => {
      reportOnce(err)
      if (id !== reqId.current) return
      setState({ status: 'error', data: [], error: err })
    })
  }, [client, term, enabled, reloadToken])

  return { ...state, reload }
}
