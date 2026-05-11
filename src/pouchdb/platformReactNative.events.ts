import { EventEmitter } from 'events'
import { listenAppState } from './platformReactNative.appState'
import { listenNetInfo } from './platformReactNative.netInfo'

export const pouchDbEmitter = new EventEmitter()

let started = false
const startListening = (): void => {
  if (started) return
  started = true
  listenAppState(pouchDbEmitter)
  listenNetInfo(pouchDbEmitter)
}

startListening()

export const events = {
  addEventListener: (name: string, handler: (...args: unknown[]) => void): void => {
    pouchDbEmitter.addListener(name, handler)
  },
  removeEventListener: (name: string, handler: (...args: unknown[]) => void): void => {
    pouchDbEmitter.removeListener(name, handler)
  }
}
