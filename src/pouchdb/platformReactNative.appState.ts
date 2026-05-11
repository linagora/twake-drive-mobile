import EventEmitter from 'events'
import { AppState, AppStateStatus, NativeEventSubscription } from 'react-native'
import Minilog from 'cozy-minilog'

const log = Minilog('PouchDB.appState')

let appState = AppState.currentState
let appStateHandler: NativeEventSubscription | undefined

export const listenAppState = (eventEmitter: EventEmitter): void => {
  appStateHandler = AppState.addEventListener('change', nextAppState => {
    log.debug('AppState event', nextAppState)
    if (isGoingToSleep(nextAppState)) eventEmitter.emit('resume')
    if (isGoingToWakeUp(nextAppState)) eventEmitter.emit('pause')
    appState = nextAppState
  })
}

export const stopListeningAppState = (): void => {
  appStateHandler?.remove()
}

const isGoingToSleep = (next: AppStateStatus): boolean =>
  Boolean(appState.match(/active/) && next === 'background')

const isGoingToWakeUp = (next: AppStateStatus): boolean =>
  Boolean(appState.match(/background/) && next === 'active')
