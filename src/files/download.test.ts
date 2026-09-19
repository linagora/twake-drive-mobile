import { Platform } from 'react-native'
import type CozyClient from 'cozy-client'

const mockEnsureLocalCopy = jest.fn()
const mockOpenFileNatively = jest.fn()
jest.mock('./openFile', () => ({
  __esModule: true,
  ensureLocalCopy: (...args: unknown[]) => mockEnsureLocalCopy(...args),
  openFileNatively: (...args: unknown[]) => mockOpenFileNatively(...args)
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

import { download, DownloadCancelledError } from './download'

const client = {} as CozyClient
const file = { _id: 'f1', name: 'rapport.pdf', mime: 'application/pdf' }

describe('download', () => {
  beforeEach(() => {
    jest.clearAllMocks()
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
})
