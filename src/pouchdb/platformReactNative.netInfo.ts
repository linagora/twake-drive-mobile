import EventEmitter from 'events'
import NetInfo, { NetInfoSubscription } from '@react-native-community/netinfo'
import Minilog from 'cozy-minilog'

const log = Minilog('PouchDB.netInfo')

let netInfoHandler: NetInfoSubscription | undefined

export const listenNetInfo = (eventEmitter: EventEmitter): void => {
  netInfoHandler = NetInfo.addEventListener(state => {
    log.debug('NetInfo event isConnected=', state.isConnected)
    if (state.isConnected) eventEmitter.emit('online')
    else eventEmitter.emit('offline')
  })
}

export const stopListeningNetInfo = (): void => {
  netInfoHandler?.()
}
