import useFlagFromLib from 'cozy-flags/dist/useFlag'

/**
 * Reads one of the instance's feature flags, and re-reads it when they land.
 *
 * The flags are fetched after the screens have mounted, so a plain `flag(name)`
 * answers undefined on the first render and nothing brings the component back:
 * the create menu kept the entries that need no flag and dropped the others.
 */
export const useFlag = (name: string): unknown => useFlagFromLib(name) as unknown
