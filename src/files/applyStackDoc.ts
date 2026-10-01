import type CozyClient from 'cozy-client'

import { persistStackDoc } from '@/pouchdb/persistStackDoc'

const FILES = 'io.cozy.files'

/**
 * Takes the document the stack returned for a mutation as the local truth: it
 * goes into the local database and into the store. The replication that
 * follows finds the revision already there and has nothing left to announce.
 */
export const applyStackDoc = async (client: CozyClient, data: { _id: string }): Promise<void> => {
  const doc = { ...(data as Record<string, unknown>), _id: data._id, _type: FILES }
  await persistStackDoc(client, doc)
  client.setData({ [FILES]: [doc] })
}
