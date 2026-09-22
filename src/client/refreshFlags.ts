import flag from 'cozy-flags'
import { Q } from 'cozy-client'
import type CozyClient from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'

const FLAGS_ID = 'io.cozy.settings.flags'

interface FlagsDoc {
  attributes?: Record<string, unknown>
  [key: string]: unknown
}

/**
 * The flags a settings document holds, whichever shape it arrives in.
 *
 * The stack answers JSON-API, with the flags under `attributes`, but the same
 * query served from the local replica answers a flattened document: cozy-pouch-link
 * normalises documents, so there is no `attributes` key and the flags sit at
 * the root next to the pouch metadata.
 */
export const flagsFromDoc = (doc: FlagsDoc | null | undefined): Record<string, unknown> => {
  if (!doc) return {}
  const source = doc.attributes ?? doc
  const flags: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(source)) {
    if (key.startsWith('_') || key === 'cozyMetadata' || key === 'id') continue
    flags[key] = value
  }
  return flags
}

/**
 * Re-reads the instance's feature flags.
 *
 * Flags are kept for the life of the session: a refresh that cannot run leaves
 * the values already in place rather than falling back to "off", which would
 * silently turn features off while offline. Nothing is fetched offline, and a
 * failed fetch is swallowed for the same reason.
 */
export const refreshFlags = async (client?: CozyClient | null): Promise<void> => {
  if (!client) return
  if (!getOnlineMonitor().getCurrent()) return
  try {
    const { data } = (await client.query(Q('io.cozy.settings').getById(FLAGS_ID))) as {
      data?: FlagsDoc
    }
    const flags = flagsFromDoc(data)
    if (Object.keys(flags).length > 0) flag.enable(flags)
  } catch (err) {
    console.warn('[refreshFlags] could not refresh the flags', err)
  }
}
