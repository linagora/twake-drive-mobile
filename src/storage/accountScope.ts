import { createMMKV } from 'react-native-mmkv'

/**
 * Local data belongs to one account. Everything an account writes on the
 * device (its offline copies, its viewer cache, its replication bookkeeping)
 * goes under a key derived from its instance, so logging into another account
 * never reads what the previous one left. cozy-pouch-link in particular stores
 * its last replication sequences per doctype only, with no instance in the key.
 */

/** Scope used before an account is known: no account data is written there. */
export const NO_ACCOUNT = 'no-account'

export const accountKeyFromUri = (uri: string): string => {
  const withoutScheme = uri.trim().replace(/^[a-z][a-z0-9+.-]*:\/\//i, '')
  const host = withoutScheme.replace(/\/.*$/, '').toLowerCase()
  const key = host.replace(/[^a-z0-9._-]/g, '_').replace(/^[._-]+/, '')
  return key || NO_ACCOUNT
}

let currentKey = NO_ACCOUNT

export const accountKey = (): string => currentKey

export const setAccountScope = (uri: string | null | undefined): string => {
  currentKey = uri ? accountKeyFromUri(uri) : NO_ACCOUNT
  return currentKey
}

export interface ScopedStorage {
  getString(key: string): string | undefined
  set(key: string, value: string): void
  remove(key: string): void
  getAllKeys(): string[]
  clearAll(): void
}

const instances = new Map<string, ScopedStorage>()

const instanceFor = (id: string): ScopedStorage => {
  const scopedId = currentKey === NO_ACCOUNT ? id : `${id}.${currentKey}`
  const existing = instances.get(scopedId)
  if (existing) return existing
  const created = createMMKV({ id: scopedId }) as unknown as ScopedStorage
  instances.set(scopedId, created)
  return created
}

/**
 * An MMKV store of the account in scope. The instance is resolved on each call
 * so a store imported at module load follows the account that logs in.
 */
export const accountStorage = (id: string): ScopedStorage => ({
  getString: key => instanceFor(id).getString(key),
  set: (key, value) => instanceFor(id).set(key, value),
  remove: key => instanceFor(id).remove(key),
  getAllKeys: () => instanceFor(id).getAllKeys(),
  clearAll: () => instanceFor(id).clearAll()
})

/** A path of this account inside a base directory, with a trailing slash. */
export const accountDir = (base: string): string => `${base}${currentKey}/`

/**
 * Hands an account the store it wrote before the stores were scoped. Runs once:
 * after the move the unscoped store is empty, and a later account finds nothing
 * to take over.
 */
export const adoptLegacyStorage = (id: string): void => {
  if (currentKey === NO_ACCOUNT) return
  const legacy = createMMKV({ id }) as unknown as ScopedStorage
  const keys = legacy.getAllKeys()
  if (keys.length === 0) return
  const scoped = instanceFor(id)
  if (scoped.getAllKeys().length > 0) return
  for (const key of keys) {
    const value = legacy.getString(key)
    if (value !== undefined) scoped.set(key, value)
  }
  legacy.clearAll()
}

/** Test seam: drops the memoized instances. */
export const resetAccountScopeForTests = (): void => {
  instances.clear()
  currentKey = NO_ACCOUNT
}
