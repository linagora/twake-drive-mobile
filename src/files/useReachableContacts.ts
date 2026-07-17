import { useEffect, useState } from 'react'
import { useClient } from 'cozy-client'

import { ContactQueryResult } from '@/client/queries'

/**
 * Reachable contacts for the share-sheet recipient autocomplete, fetched from
 * the STACK rather than local Pouch.
 *
 * The autocomplete needs the instance's full, current address book. Serving it
 * from the replicated Pouch copy came up empty because:
 *  - on a fresh session the contacts have not finished replicating, and
 *  - the reachable-contacts query relies on a partialIndex (`$or` / `$not` /
 *    `$size`) that pouch-find cannot always build, so the local query yields
 *    nothing at all.
 * Sharing is an online-only action anyway (`requireOnline` gates it), so we
 * query the stack directly via the raw stack client, which bypasses PouchLink.
 * Reachability (has an email) is filtered client-side in `contactSuggestions`.
 */
export const useReachableContacts = (
  enabled: boolean
): { contacts: ContactQueryResult[]; loading: boolean } => {
  const client = useClient()
  const [contacts, setContacts] = useState<ContactQueryResult[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !client) {
      setContacts([])
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    void (async () => {
      try {
        const resp = (await client
          .getStackClient()
          .collection('io.cozy.contacts')
          .all({ limit: 1000 })) as { data?: ContactQueryResult[] }
        if (cancelled) return
        const data = resp.data ?? []
        setContacts(data.filter(c => !(c as { trashed?: boolean }).trashed))
      } catch (e) {
        console.error('[useReachableContacts] stack contacts query failed', e)
        if (!cancelled) setContacts([])
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [enabled, client])

  return { contacts, loading }
}
