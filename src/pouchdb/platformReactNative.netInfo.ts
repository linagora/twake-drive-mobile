import EventEmitter from 'events'
import Minilog from 'cozy-minilog'

import { getOnlineMonitor } from '@/network/OnlineMonitor'

const log = Minilog('PouchDB.netInfo')

let unsubscribe: (() => void) | undefined

/**
 * Feeds cozy-pouch-link's own `online` / `offline` events, which PouchManager
 * uses to start and stop its replication loop.
 *
 * The source is the shared OnlineMonitor rather than NetInfo alone, so this
 * agrees with `platform.isOnline` and with what the UI shows: a network that
 * is connected but cannot reach the stack counts as offline, and the loop is
 * stopped instead of retrying replications that cannot complete.
 */
export const listenNetInfo = (eventEmitter: EventEmitter): void => {
  const monitor = getOnlineMonitor()
  const emit = (online: boolean): void => {
    log.debug('online=', online)
    eventEmitter.emit(online ? 'online' : 'offline')
  }
  emit(monitor.getCurrent())
  unsubscribe = monitor.subscribe(emit)
}

export const stopListeningNetInfo = (): void => {
  unsubscribe?.()
  unsubscribe = undefined
}
