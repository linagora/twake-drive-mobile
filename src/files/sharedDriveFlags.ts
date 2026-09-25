import flag from 'cozy-flags'

export const EAGER_SHARED_DRIVE_SYNC_FLAG = 'drive.mobile.shareddrives.eager-sync.enabled'

/**
 * Whether every shared drive replicates from the first sync, rather than only
 * the ones the user has opened.
 *
 * Off unless the instance turns it on: an instance can hold dozens of drives,
 * and pulling all of them at launch is a sync the user never asked for. The
 * flag is there to measure that cost against what it buys — a drive that opens
 * with its contents already there, instead of waiting for a replication that
 * only starts when it is entered.
 */
export const isEagerSharedDriveSyncEnabled = (): boolean =>
  flag(EAGER_SHARED_DRIVE_SYNC_FLAG) === true
