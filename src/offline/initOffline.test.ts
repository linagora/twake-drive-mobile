jest.mock('expo-file-system/legacy', () => ({
  readDirectoryAsync: jest.fn().mockResolvedValue([]),
  deleteAsync: jest.fn(),
  getInfoAsync: jest.fn()
}))

jest.mock('./FileSystemRepo', () => ({
  FileSystemRepo: {
    init: jest.fn().mockResolvedValue(undefined),
    dir: () => 'file:///doc/offline/',
    exists: jest.fn().mockResolvedValue(true)
  }
}))

jest.mock('./OfflineFilesStore', () => ({
  OfflineFilesStore: { getAll: () => [], get: jest.fn(), update: jest.fn() }
}))

jest.mock('./Downloader', () => ({
  Downloader: {
    init: jest.fn(),
    enqueue: jest.fn(),
    stop: jest.fn().mockResolvedValue(undefined)
  }
}))

const mockStopReactor = jest.fn()
jest.mock('./pinReactor', () => ({ startPinReactor: jest.fn(() => mockStopReactor) }))
jest.mock('./reconcileFolderPins', () => ({ reconcileFolderPins: jest.fn() }))
jest.mock('@/pouchdb/triggerReplication', () => ({
  getPouchLink: (client: { pouch: unknown }) => ({ getPouch: () => client.pouch })
}))
jest.mock('@/files/streamUrl', () => ({ buildRevisionDownloadUrl: jest.fn() }))

import type CozyClient from 'cozy-client'

import { FileSystemRepo } from './FileSystemRepo'
import { Downloader } from './Downloader'
import { startPinReactor } from './pinReactor'
import { initOfflineSubsystem, teardownOfflineSubsystem } from './initOffline'

const makeClient = (name: string): CozyClient => ({ pouch: { name } }) as unknown as CozyClient
const pouchOf = (client: CozyClient): unknown => (client as unknown as { pouch: unknown }).pouch

describe('initOfflineSubsystem', () => {
  beforeEach(async () => {
    await teardownOfflineSubsystem()
    jest.clearAllMocks()
  })

  it('sets the subsystem up once for a given client', async () => {
    const client = makeClient('alice')
    await initOfflineSubsystem(client)
    await initOfflineSubsystem(client)
    expect(FileSystemRepo.init).toHaveBeenCalledTimes(1)
    expect(startPinReactor).toHaveBeenCalledTimes(1)
  })

  // Signing in again without the app being killed: the new session must get
  // its own setup, and the reactor must leave the previous session's Pouch.
  it('sets it up again for the next session after a teardown', async () => {
    const alice = makeClient('alice')
    const bob = makeClient('bob')
    await initOfflineSubsystem(alice)
    await teardownOfflineSubsystem()
    expect(mockStopReactor).toHaveBeenCalledTimes(1)
    expect(Downloader.stop).toHaveBeenCalledTimes(1)

    await initOfflineSubsystem(bob)
    expect(FileSystemRepo.init).toHaveBeenCalledTimes(2)
    expect(startPinReactor).toHaveBeenLastCalledWith(pouchOf(bob))
  })

  it('moves to a new client without a teardown in between', async () => {
    const before = makeClient('alice')
    const after = makeClient('alice-certified')
    await initOfflineSubsystem(before)
    await initOfflineSubsystem(after)
    expect(mockStopReactor).toHaveBeenCalledTimes(1)
    expect(startPinReactor).toHaveBeenLastCalledWith(pouchOf(after))
  })

  it('leaves the rest of the setup alone when a teardown comes in the middle', async () => {
    let finishRepoInit: () => void = () => undefined
    ;(FileSystemRepo.init as jest.Mock).mockImplementationOnce(
      () => new Promise<void>(resolve => (finishRepoInit = resolve))
    )
    const setup = initOfflineSubsystem(makeClient('alice'))
    await teardownOfflineSubsystem()
    finishRepoInit()
    await setup
    expect(Downloader.init).not.toHaveBeenCalled()
    expect(startPinReactor).not.toHaveBeenCalled()
  })
})
