import EventEmitter from 'events'

let mockOnline = true
const mockSubscribers: ((online: boolean) => void)[] = []

jest.mock('@/network/OnlineMonitor', () => ({
  getOnlineMonitor: () => ({
    getCurrent: () => mockOnline,
    subscribe: (listener: (online: boolean) => void) => {
      mockSubscribers.push(listener)
      return () => undefined
    }
  })
}))

import { listenNetInfo, stopListeningNetInfo } from './platformReactNative.netInfo'

describe('listenNetInfo', () => {
  afterEach(() => {
    stopListeningNetInfo()
    mockSubscribers.length = 0
    mockOnline = true
  })

  // PouchManager starts and stops its replication loop on these two events.
  it('emits the current state as soon as it starts listening', () => {
    const emitter = new EventEmitter()
    const seen: string[] = []
    emitter.on('online', () => seen.push('online'))
    emitter.on('offline', () => seen.push('offline'))
    mockOnline = false
    listenNetInfo(emitter)
    expect(seen).toEqual(['offline'])
  })

  it('emits offline then online as the monitor flips', () => {
    const emitter = new EventEmitter()
    const seen: string[] = []
    emitter.on('online', () => seen.push('online'))
    emitter.on('offline', () => seen.push('offline'))
    listenNetInfo(emitter)
    mockSubscribers.forEach(l => l(false))
    mockSubscribers.forEach(l => l(true))
    expect(seen).toEqual(['online', 'offline', 'online'])
  })
})
