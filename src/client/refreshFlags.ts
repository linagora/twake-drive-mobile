import flag from 'cozy-flags'
import type CozyClient from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'

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
    await flag.initializeFromRemote(client)
  } catch (err) {
    console.warn('[refreshFlags] could not refresh the flags', err)
  }
}
