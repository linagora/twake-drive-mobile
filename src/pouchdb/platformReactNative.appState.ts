import EventEmitter from 'events'
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native'

let appState = AppState.currentState
let appStateHandler: NativeEventSubscription | undefined

/**
 * Bridge React Native's AppState to the cozy-pouch-link event emitter.
 *
 * cozy-pouch-link's PouchManager wires:
 *   - `'resume'` → `startReplicationLoop`
 *   - `'pause'`  → `stopReplicationLoop`
 *
 * So the natural mapping is: emit `'resume'` when the app wakes up
 * (background → active), `'pause'` when it goes to sleep.
 *
 * (Note: an older copy of this shim from cozy-flagship-app had the
 *  semantics inverted with a "do not fix" comment. That comment was
 *  wrong for this version of cozy-pouch-link — when the events were
 *  inverted, the replication loop ran only while the app was in the
 *  background, which is exactly the opposite of what we want.)
 */
export const listenAppState = (eventEmitter: EventEmitter): void => {
  appStateHandler = AppState.addEventListener('change', nextAppState => {
    if (isGoingToWakeUp(nextAppState)) eventEmitter.emit('resume')
    if (isGoingToSleep(nextAppState)) eventEmitter.emit('pause')
    appState = nextAppState
  })
}

/**
 * Nothing calls it yet, logout should: see #437.
 * @public
 */
export const stopListeningAppState = (): void => {
  appStateHandler?.remove()
}

const isGoingToSleep = (next: AppStateStatus): boolean =>
  Boolean(appState.match(/active/) && next === 'background')

const isGoingToWakeUp = (next: AppStateStatus): boolean =>
  Boolean(appState.match(/background/) && next === 'active')
