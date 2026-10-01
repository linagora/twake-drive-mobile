import type CozyClient from 'cozy-client'

import { getReplicatedDriveIds, sharedDriveDoctype } from '@/files/sharedDriveReplication'
import { getPouchLink } from '@/pouchdb/triggerReplication'

import { ensureFileNameIndex, SearchDb } from './fileNameIndex'

const FILES_DOCTYPE = 'io.cozy.files'

export interface SearchDatabase {
  db: SearchDb
  driveId?: string
}

interface SearchLink {
  doctypes: string[]
  getQueryEngineFromDoctype: (
    doctype: string,
    options?: { driveId: string }
  ) => { db?: SearchDb | null } | null
}

export const getSearchDatabases = (client: CozyClient): SearchDatabase[] => {
  const link = getPouchLink(client) as unknown as SearchLink | null
  if (!link) return []
  const databases: SearchDatabase[] = []
  const personal = link.getQueryEngineFromDoctype(FILES_DOCTYPE)?.db
  if (personal) databases.push({ db: personal })
  for (const driveId of getReplicatedDriveIds()) {
    if (!link.doctypes.includes(sharedDriveDoctype(driveId))) continue
    const db = link.getQueryEngineFromDoctype(FILES_DOCTYPE, { driveId })?.db
    if (db) databases.push({ db, driveId })
  }
  return databases
}

export const ensureAllFileNameIndexes = async (client: CozyClient): Promise<void> => {
  let databases: SearchDatabase[]
  try {
    databases = getSearchDatabases(client)
  } catch (e) {
    console.warn('[search] could not open the databases', e)
    return
  }
  for (const { db, driveId } of databases) {
    try {
      await ensureFileNameIndex(db)
    } catch (e) {
      console.warn('[search] could not index', driveId ?? 'personal drive', e)
    }
  }
}
