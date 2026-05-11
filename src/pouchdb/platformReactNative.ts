import { events } from './platformReactNative.events'
import { isOnline } from './platformReactNative.isOnline'
import { storage } from './platformReactNative.storage'
import PouchDB from './pouchdb'

export const platformReactNative = {
  storage,
  events,
  pouchAdapter: PouchDB,
  isOnline
}
