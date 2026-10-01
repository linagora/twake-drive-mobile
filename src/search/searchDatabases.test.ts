jest.mock('@/pouchdb/triggerReplication', () => ({ getPouchLink: jest.fn() }))
jest.mock('@/files/sharedDriveReplication', () => ({
  getReplicatedDriveIds: jest.fn(),
  sharedDriveDoctype: (driveId: string) => `io.cozy.files.shareddrives-${driveId}`
}))
jest.mock('./fileNameIndex', () => ({
  dropFileNameIndex: jest.fn(),
  ensureFileNameIndex: jest.fn()
}))

import type CozyClient from 'cozy-client'

import { getReplicatedDriveIds } from '@/files/sharedDriveReplication'
import { getPouchLink } from '@/pouchdb/triggerReplication'

import { dropFileNameIndex, ensureFileNameIndex } from './fileNameIndex'
import {
  dropAllFileNameIndexes,
  dropSharedDriveFileNameIndex,
  ensureAllFileNameIndexes,
  getSearchDatabases
} from './searchDatabases'

const mockGetPouchLink = getPouchLink as jest.Mock
const mockReplicated = getReplicatedDriveIds as jest.Mock
const mockEnsure = ensureFileNameIndex as jest.Mock
const mockDrop = dropFileNameIndex as jest.Mock

const client = {} as CozyClient
const personal = { id: 'personal' }
const driveA = { id: 'drive-a' }

const makeLink = (doctypes: string[]) => ({
  doctypes,
  getQueryEngineFromDoctype: jest.fn((_doctype: string, options?: { driveId: string }) => ({
    db: options?.driveId === 'a' ? driveA : personal
  }))
})

beforeEach(() => {
  jest.clearAllMocks()
  mockReplicated.mockReturnValue([])
})

describe('getSearchDatabases', () => {
  it('returns nothing without a pouch link', () => {
    mockGetPouchLink.mockReturnValue(null)
    expect(getSearchDatabases(client)).toEqual([])
  })

  it('returns the personal database', () => {
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files']))
    expect(getSearchDatabases(client)).toEqual([{ db: personal }])
  })

  it('adds the replicated drives registered on the link', () => {
    mockReplicated.mockReturnValue(['a'])
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files', 'io.cozy.files.shareddrives-a']))
    expect(getSearchDatabases(client)).toEqual([{ db: personal }, { db: driveA, driveId: 'a' }])
  })

  it('leaves out a replicated drive the link does not know', () => {
    mockReplicated.mockReturnValue(['b'])
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files']))
    expect(getSearchDatabases(client)).toEqual([{ db: personal }])
  })

  it('leaves out a database whose handle is not open', () => {
    const link = makeLink(['io.cozy.files'])
    link.getQueryEngineFromDoctype.mockReturnValue({ db: null as never })
    mockGetPouchLink.mockReturnValue(link)
    expect(getSearchDatabases(client)).toEqual([])
  })
})

describe('ensureAllFileNameIndexes', () => {
  it('ensures every database and survives a failing one', async () => {
    mockReplicated.mockReturnValue(['a'])
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files', 'io.cozy.files.shareddrives-a']))
    mockEnsure.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(true)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(ensureAllFileNameIndexes(client)).resolves.toBeUndefined()
    expect(mockEnsure).toHaveBeenCalledTimes(2)
    expect(mockEnsure).toHaveBeenLastCalledWith(driveA)
    warn.mockRestore()
  })

  it('resolves when the databases cannot be opened', async () => {
    const link = makeLink(['io.cozy.files'])
    link.getQueryEngineFromDoctype.mockImplementation(() => {
      throw new Error('cannot open')
    })
    mockGetPouchLink.mockReturnValue(link)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(ensureAllFileNameIndexes(client)).resolves.toBeUndefined()
    expect(mockEnsure).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})

describe('dropAllFileNameIndexes', () => {
  it('drops the index of every database and survives a failing one', async () => {
    mockReplicated.mockReturnValue(['a'])
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files', 'io.cozy.files.shareddrives-a']))
    mockDrop.mockRejectedValueOnce(new Error('locked')).mockResolvedValueOnce(undefined)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(dropAllFileNameIndexes(client)).resolves.toBeUndefined()
    expect(mockDrop.mock.calls).toEqual([[personal], [driveA]])
    warn.mockRestore()
  })

  it('resolves when the databases cannot be opened', async () => {
    const link = makeLink(['io.cozy.files'])
    link.getQueryEngineFromDoctype.mockImplementation(() => {
      throw new Error('cannot open')
    })
    mockGetPouchLink.mockReturnValue(link)
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(dropAllFileNameIndexes(client)).resolves.toBeUndefined()
    expect(mockDrop).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})

describe('dropSharedDriveFileNameIndex', () => {
  it('drops the index of that drive only', async () => {
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files', 'io.cozy.files.shareddrives-a']))
    await dropSharedDriveFileNameIndex(client, 'a')
    expect(mockDrop.mock.calls).toEqual([[driveA]])
  })

  it('does nothing for a drive the link does not know', async () => {
    const link = makeLink(['io.cozy.files'])
    mockGetPouchLink.mockReturnValue(link)
    await dropSharedDriveFileNameIndex(client, 'a')
    expect(link.getQueryEngineFromDoctype).not.toHaveBeenCalled()
    expect(mockDrop).not.toHaveBeenCalled()
  })

  it('does nothing without a pouch link', async () => {
    mockGetPouchLink.mockReturnValue(null)
    await expect(dropSharedDriveFileNameIndex(client, 'a')).resolves.toBeUndefined()
    expect(mockDrop).not.toHaveBeenCalled()
  })

  it('resolves when the drop fails', async () => {
    mockGetPouchLink.mockReturnValue(makeLink(['io.cozy.files', 'io.cozy.files.shareddrives-a']))
    mockDrop.mockRejectedValueOnce(new Error('locked'))
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(dropSharedDriveFileNameIndex(client, 'a')).resolves.toBeUndefined()
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
})
