import CozyClient, { CozyLink, Q, StackLink } from 'cozy-client'
import PouchLink from 'cozy-pouch-link'

import { platformReactNative } from './platformReactNative'

export const REPLICATION_DEBOUNCE = 60 * 1000 // 60s
export const REPLICATION_DEBOUNCE_MAX_DELAY = 5 * 60 * 1000 // 5min
// Periodic background sync: 30s — matches cozy-pouch-link's default.
// Combined with the foreground-trigger (useForegroundSync) and per-mutation
// triggers, this keeps the local cache fresh enough that remote edits show
// up within ~30s even without user interaction.
export const PERIODIC_SYNC_INTERVAL_MS = 30 * 1000

export const offlineDoctypes = [
  'io.cozy.files',
  'io.cozy.sharings',
  'io.cozy.permissions',
  'io.cozy.notes',
  'io.cozy.contacts'
] as const

// Warmup queries are GATES: until they complete on the first replication
// loop, every query for the doctype is FORWARDED to the next link (StackLink)
// instead of being served from (possibly empty) local Pouch. After warmup,
// queries are served from local Pouch. Without warmupQueries, PouchLink would
// serve queries immediately — returning partial or empty results during the
// initial replication, which the UI then caches forever.
//
// Shape required by cozy-pouch-link (see CozyPouchLink.spec.js + PouchManager.spec.js):
//   { definition: () => QueryDefinition, options: { as: string } }
//
// We use a single trivial warmup per doctype — its purpose is just to gate
// the local-vs-stack decision, not to pre-fetch anything specific.
const buildWarmupQuery = (doctype: string): unknown => ({
  definition: () => Q(doctype).limitBy(1),
  options: { as: `${doctype}/warmup` }
})

const doctypesReplicationOptions = Object.fromEntries(
  offlineDoctypes.map(dt => [
    dt,
    {
      strategy: 'fromRemote' as const,
      warmupQueries: [buildWarmupQuery(dt)]
    }
  ])
)

export const getLinks = (): CozyLink[] => {
  const pouchLink = new PouchLink({
    doctypes: [...offlineDoctypes],
    initialSync: false,
    periodicSync: true,
    replicationInterval: PERIODIC_SYNC_INTERVAL_MS,
    syncDebounceDelayInMs: REPLICATION_DEBOUNCE,
    syncDebounceMaxDelayInMs: REPLICATION_DEBOUNCE_MAX_DELAY,
    platform: platformReactNative,
    ignoreWarmup: false,
    doctypesReplicationOptions,
    pouch: {
      options: {
        adapter: 'react-native-sqlite'
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any)

  const stackLink = new StackLink()

  // PouchLink first → it intercepts queries for cached doctypes before StackLink.
  return [pouchLink as unknown as CozyLink, stackLink]
}

export const resetLinks = async (client?: CozyClient): Promise<void> => {
  if (!client) return
  for (const link of client.links) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call
    await (link as { reset?: () => Promise<void> }).reset?.()
  }
}
