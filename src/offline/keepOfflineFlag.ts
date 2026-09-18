import flag from 'cozy-flags'

export const KEEP_OFFLINE_FLAG = 'drive.mobile.keep-offline-files.enabled'

/**
 * Whether the instance lets its users keep files and folders offline.
 *
 * Reads like the other feature flags, except for the default: keeping files
 * offline already ships, so an instance that never heard of the flag keeps the
 * feature and only an explicit `false` takes it away.
 */
export const isKeepOfflineEnabled = (): boolean => flag(KEEP_OFFLINE_FLAG) !== false
