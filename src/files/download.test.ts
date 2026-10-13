import { Platform } from 'react-native'
import type CozyClient from 'cozy-client'

const mockEnsureLocalCopy = jest.fn()
const mockOpenFileNatively = jest.fn()
const mockOpenInViewer = jest.fn()
jest.mock('./openFile', () => ({
  __esModule: true,
  ensureLocalCopy: (...args: unknown[]) => mockEnsureLocalCopy(...args),
  openFileNatively: (...args: unknown[]) => mockOpenFileNatively(...args),
  openInViewer: (...args: unknown[]) => mockOpenInViewer(...args)
}))

const mockStore = new Map<string, string>()
jest.mock('react-native-mmkv', () => ({
  createMMKV: () => ({
    getString: (k: string) => mockStore.get(k),
    set: (k: string, v: string) => mockStore.set(k, v),
    remove: (k: string) => mockStore.delete(k)
  })
}))

const mockRequestPermissions = jest.fn()
const mockCreateFile = jest.fn()
const mockRead = jest.fn()
const mockWrite = jest.fn()
const mockDownloadAsync = jest.fn()
const mockFetch = jest.fn()
const mockConfig = jest.fn(() => ({ fetch: mockFetch }))
jest.mock('react-native-blob-util', () => ({
  __esModule: true,
  default: { config: (...args: unknown[]) => (mockConfig as (...a: unknown[]) => unknown)(...args) }
}))
const mockDeleteAsync = jest.fn().mockResolvedValue(undefined)
jest.mock('@/storage/accountScope', () => ({ accountDir: (base: string) => `${base}acc/` }))
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  EncodingType: { Base64: 'base64' },
  cacheDirectory: 'file:///cache/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  deleteAsync: (...args: unknown[]) => mockDeleteAsync(...args),
  downloadAsync: (...args: unknown[]) => mockDownloadAsync(...args),
  readAsStringAsync: (...args: unknown[]) => mockRead(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWrite(...args),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
    createFileAsync: (...args: unknown[]) => mockCreateFile(...args)
  }
}))

import {
  download,
  downloadFolder,
  DownloadCancelledError,
  forgetDownloadDirectory
} from './download'

const client = {} as CozyClient
const file = { _id: 'f1', name: 'rapport.pdf', mime: 'application/pdf' }

describe('download', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockStore.clear()
    mockEnsureLocalCopy.mockResolvedValue('file:///cache/f1-rapport.pdf')
    mockRead.mockResolvedValue('Ym9keQ==')
    mockCreateFile.mockResolvedValue('content://tree/doc/rapport.pdf')
    mockRequestPermissions.mockResolvedValue({ granted: true, directoryUri: 'content://tree' })
  })
  afterEach(() => {
    Platform.OS = 'ios'
  })

  it('writes the file where the user points on Android', async () => {
    Platform.OS = 'android'

    await download(client, file, 'drive-7')

    expect(mockEnsureLocalCopy).toHaveBeenCalledWith(client, file, 'drive-7')
    expect(mockCreateFile).toHaveBeenCalledWith('content://tree', 'rapport.pdf', 'application/pdf')
    expect(mockWrite).toHaveBeenCalledWith('content://tree/doc/rapport.pdf', 'Ym9keQ==', {
      encoding: 'base64'
    })
    expect(mockOpenFileNatively).not.toHaveBeenCalled()
  })

  it('says the download was cancelled when no folder is picked', async () => {
    Platform.OS = 'android'
    mockRequestPermissions.mockResolvedValue({ granted: false })

    await expect(download(client, file)).rejects.toBeInstanceOf(DownloadCancelledError)
    expect(mockWrite).not.toHaveBeenCalled()
  })

  it('hands the file to the system sheet on iOS, which owns Save to Files', async () => {
    await download(client, file)

    expect(mockOpenFileNatively).toHaveBeenCalledWith(client, file, undefined)
    expect(mockRequestPermissions).not.toHaveBeenCalled()
  })

  // The picker used to open on every single file, and Android keeps the grant
  // for as long as the app is installed (#273).
  it('asks for a folder once and writes the next file straight into it', async () => {
    Platform.OS = 'android'

    await download(client, file)
    await download(client, { _id: 'f2', name: 'notes.txt', mime: 'text/plain' })

    expect(mockRequestPermissions).toHaveBeenCalledTimes(1)
    expect(mockCreateFile).toHaveBeenNthCalledWith(2, 'content://tree', 'notes.txt', 'text/plain')
  })

  it('asks again when the folder it remembered cannot be written to', async () => {
    Platform.OS = 'android'
    await download(client, file)
    mockCreateFile.mockRejectedValueOnce(new Error('permission revoked'))
    mockRequestPermissions.mockResolvedValue({ granted: true, directoryUri: 'content://other' })

    await download(client, file)

    expect(mockRequestPermissions).toHaveBeenCalledTimes(2)
    expect(mockCreateFile).toHaveBeenLastCalledWith(
      'content://other',
      'rapport.pdf',
      'application/pdf'
    )
  })

  it('opens the picker on the folder it remembered', async () => {
    Platform.OS = 'android'
    await download(client, file)
    mockCreateFile.mockRejectedValueOnce(new Error('gone'))

    await download(client, file)

    expect(mockRequestPermissions).toHaveBeenLastCalledWith('content://tree')
  })

  it('does not remember a folder the user refused', async () => {
    Platform.OS = 'android'
    mockRequestPermissions.mockResolvedValue({ granted: false })

    await expect(download(client, file)).rejects.toBeInstanceOf(DownloadCancelledError)

    mockRequestPermissions.mockResolvedValue({ granted: true, directoryUri: 'content://tree' })
    await download(client, file)
    expect(mockRequestPermissions).toHaveBeenCalledTimes(2)
  })

  it('forgets the folder on request', async () => {
    Platform.OS = 'android'
    await download(client, file)

    forgetDownloadDirectory()
    await download(client, file)

    expect(mockRequestPermissions).toHaveBeenCalledTimes(2)
  })
})

describe('downloadFolder', () => {
  const createArchiveLinkByIds = jest.fn()
  const folderClient = {
    getStackClient: () => ({
      collection: () => ({ createArchiveLinkByIds }),
      fullpath: (href: string) => `https://alice.example${href}`,
      getAccessToken: () => 'token'
    })
  } as unknown as CozyClient

  beforeEach(() => {
    jest.clearAllMocks()
    mockStore.clear()
    createArchiveLinkByIds.mockResolvedValue('/files/archive/secret/Projet.zip')
    mockDownloadAsync.mockResolvedValue({
      status: 200,
      uri: 'file:///cache/twake-drive/d1/Projet.zip'
    })
    mockRead.mockResolvedValue('emlw')
    mockCreateFile.mockResolvedValue('content://tree/doc/Projet.zip')
    mockRequestPermissions.mockResolvedValue({ granted: true, directoryUri: 'content://tree' })
  })
  afterEach(() => {
    Platform.OS = 'ios'
  })

  it('hands the zip to the system sheet on iOS', async () => {
    await expect(downloadFolder(folderClient, { _id: 'd1', name: 'Projet' })).resolves.toBe(
      'opened'
    )

    expect(createArchiveLinkByIds).toHaveBeenCalledWith({ ids: ['d1'], name: 'Projet' })
    expect(mockDeleteAsync).toHaveBeenCalledWith('file:///cache/twake-drive/viewer/acc/archives/', {
      idempotent: true
    })
    expect(mockDownloadAsync).toHaveBeenCalledWith(
      'https://alice.example/files/archive/secret/Projet.zip',
      'file:///cache/twake-drive/viewer/acc/archives/d1/Projet.zip',
      { headers: { Authorization: 'Bearer token' } }
    )
    expect(mockOpenInViewer).toHaveBeenCalledWith('file:///cache/twake-drive/d1/Projet.zip')
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('has the system download manager fetch the zip into Downloads on Android', async () => {
    Platform.OS = 'android'
    mockFetch.mockReturnValue(new Promise(() => undefined))
    jest.useFakeTimers()

    const done = downloadFolder(folderClient, { _id: 'd1', name: 'Projet' })
    await (
      jest as unknown as { advanceTimersByTimeAsync: (ms: number) => Promise<void> }
    ).advanceTimersByTimeAsync(2000)

    await expect(done).resolves.toBe('queued')
    jest.useRealTimers()
    expect(mockConfig).toHaveBeenCalledWith({
      addAndroidDownloads: expect.objectContaining({
        useDownloadManager: true,
        notification: true,
        storeInDownloads: true,
        title: 'Projet.zip',
        mime: 'application/zip'
      })
    })
    expect(mockFetch).toHaveBeenCalledWith(
      'GET',
      'https://alice.example/files/archive/secret/Projet.zip'
    )
    expect(mockRead).not.toHaveBeenCalled()
    expect(mockDownloadAsync).not.toHaveBeenCalled()
    expect(mockOpenInViewer).not.toHaveBeenCalled()
  })

  it('fails when the download manager refuses the request on Android', async () => {
    Platform.OS = 'android'
    mockFetch.mockRejectedValue(new Error('Failed to create parent directory'))

    await expect(downloadFolder(folderClient, { _id: 'd1', name: 'Projet' })).rejects.toThrow(
      'Failed to create parent directory'
    )
  })

  it('fails when the archive cannot be fetched', async () => {
    mockDownloadAsync.mockResolvedValue({ status: 500, uri: '' })

    await expect(downloadFolder(folderClient, { _id: 'd1', name: 'Projet' })).rejects.toThrow(
      'HTTP 500'
    )
  })
})
