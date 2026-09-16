import { Q, useClient, useQuery } from 'cozy-client'

/** Initials from a display name (first two words) or the email local part. */
export function deriveInitials(name?: string, email?: string): string {
  const n = (name ?? '').trim()
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean)
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase()
  }
  const local = (email ?? '').split('@')[0]
  if (local) return local[0].toUpperCase()
  return 'U'
}

interface InstanceSettings {
  public_name?: string
  email?: string
  locale?: string
  attributes?: { public_name?: string; email?: string; locale?: string }
}

// The cozy instance settings live in the `io.cozy.settings` doctype (the
// `io.cozy.settings.instance` singleton). We already hold the `io.cozy.settings:GET`
// scope. Read defensively (flat or nested under `attributes`) and always fall back
// so the account section renders even offline / on an unexpected shape.
const instanceQuery = Q('io.cozy.settings').getById('io.cozy.settings.instance')

export function useCurrentUser(): {
  name?: string
  email?: string
  locale?: string
  initials: string
  /** Instance avatar, served unauthenticated by the stack. Undefined until the
   *  client knows its instance. */
  avatarUrl?: string
  loading: boolean
} {
  const client = useClient()
  const { data, fetchStatus } = useQuery(instanceQuery, { as: 'io.cozy.settings/instance' })
  const doc = (Array.isArray(data) ? data[0] : data) as InstanceSettings | null | undefined
  const name = doc?.public_name ?? doc?.attributes?.public_name
  const email = doc?.email ?? doc?.attributes?.email
  const locale = doc?.locale ?? doc?.attributes?.locale
  // Defensive like useIsOnline: not every client in the tree (or in a test)
  // exposes a stack client.
  const stackUri = (
    client as { getStackClient?: () => { uri?: string } } | null
  )?.getStackClient?.()?.uri
  return {
    name,
    email,
    locale,
    initials: deriveInitials(name, email),
    avatarUrl: stackUri ? `${stackUri}/public/avatar` : undefined,
    loading: fetchStatus === 'loading'
  }
}
