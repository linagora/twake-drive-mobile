import { Platform } from 'react-native'
import type CozyClient from 'cozy-client'

const mockEnsureLocalCopy = jest.fn()
const mockOpenFileNatively = jest.fn()
jest.mock('./openFile', () => ({
  __esModule: true,
  ensureLocalCopy: (...args: unknown[]) => mockEnsureLocalCopy(...args),
  openFileNatively: (...args: unknown[]) => mockOpenFileNatively(...args)
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
jest.mock('expo-file-system/legacy', () => ({
  __esModule: true,
  EncodingType: { Base64: 'base64' },
  readAsStringAsync: (...args: unknown[]) => mockRead(...args),
  writeAsStringAsync: (...args: unknown[]) => mockWrite(...args),
  StorageAccessFramework: {
    requestDirectoryPermissionsAsync: (...args: unknown[]) => mockRequestPermissions(...args),
    createFileAsync: (...args: unknown[]) => mockCreateFile(...args)
  }
}))

import { download, DownloadCancelledError, forgetDownloadDirectory } from './download'

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
