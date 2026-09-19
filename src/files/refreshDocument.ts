import CozyClient from 'cozy-client'
import Minilog from 'cozy-minilog'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

const log = Minilog('RefreshDocument')

interface FileStatCollection {
  statById: (id: string) => Promise<{ data?: unknown }>
}

/**
 * Reads one document back from the stack and puts it in the store, then asks
 * the replication to catch up.
 */
export const refreshDocumentFromStack = async (
  client: CozyClient | undefined | null,
  fileId: string | undefined,
  driveId?: string
): Promise<void> => {
  if (!client || !fileId) return
  if (!getOnlineMonitor().getCurrent()) return
  try {
    const collection = client.collection(
      'io.cozy.files',
      driveId ? { driveId } : undefined
    ) as unknown as FileStatCollection
    const { data } = await collection.statById(fileId)
    if (data) client.setData({ 'io.cozy.files': [data] })
  } catch (e) {
    log.warn('stat failed', fileId, (e as Error).message)
  }
  triggerPouchReplication(client, 'io.cozy.files')
}
