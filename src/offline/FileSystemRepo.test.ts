jest.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///doc/',
  makeDirectoryAsync: jest.fn().mockResolvedValue(undefined),
  getInfoAsync: jest.fn(),
  deleteAsync: jest.fn().mockResolvedValue(undefined),
  moveAsync: jest.fn().mockResolvedValue(undefined),
  readDirectoryAsync: jest.fn().mockResolvedValue([])
}))

import * as FS from 'expo-file-system/legacy'

import { resetAccountScopeForTests, setAccountScope } from '@/storage/accountScope'

import { FileSystemRepo } from './FileSystemRepo'

const ACCOUNT = 'file:///doc/offline/alice.cozy.test/'

describe('FileSystemRepo', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    resetAccountScopeForTests()
    setAccountScope('https://alice.cozy.test')
  })

  it('localPath puts the file under the directory of the account', () => {
    expect(FileSystemRepo.localPath('abc')).toBe(`${ACCOUNT}abc`)
  })

  it('gives another account another directory', () => {
    setAccountScope('https://bob.cozy.test')
    expect(FileSystemRepo.localPath('abc')).toBe('file:///doc/offline/bob.cozy.test/abc')
  })

  it('init creates the offline directory if missing', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: false })
    await FileSystemRepo.init()
    expect(FS.makeDirectoryAsync).toHaveBeenCalledWith(ACCOUNT, {
      intermediates: true
    })
  })

  it('init is idempotent', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, isDirectory: true })
    await FileSystemRepo.init()
    expect(FS.makeDirectoryAsync).not.toHaveBeenCalled()
  })

  it('exists returns true when the file is on disk', async () => {
    ;(FS.getInfoAsync as jest.Mock).mockResolvedValueOnce({ exists: true, size: 12 })
    expect(await FileSystemRepo.exists('abc')).toBe(true)
  })

  it('delete removes the blob and is silent if missing', async () => {
    await FileSystemRepo.delete('abc')
    expect(FS.deleteAsync).toHaveBeenCalledWith(`${ACCOUNT}abc`, { idempotent: true })
  })

  // Copies downloaded before the directory was split per account sit at the
  // root of `offline/` and belong to the account opening the app (#269).
  it('adoptLegacyFiles moves the copies of the old layout into the account', async () => {
    ;(FS.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['abc', 'bob.cozy.test'])
    ;(FS.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, isDirectory: true })
      .mockResolvedValueOnce({ exists: true, isDirectory: false, size: 10 })
      .mockResolvedValueOnce({ exists: true, isDirectory: true })

    await FileSystemRepo.adoptLegacyFiles()

    expect(FS.moveAsync).toHaveBeenCalledTimes(1)
    expect(FS.moveAsync).toHaveBeenCalledWith({
      from: 'file:///doc/offline/abc',
      to: `${ACCOUNT}abc`
    })
  })

  it('adoptLegacyFiles keeps out of it while no account is in scope', async () => {
    resetAccountScopeForTests()

    await FileSystemRepo.adoptLegacyFiles()

    expect(FS.readDirectoryAsync).not.toHaveBeenCalled()

    expect(FS.moveAsync).not.toHaveBeenCalled()
  })

  it('totalBytes sums getInfoAsync.size across the directory', async () => {
    ;(FS.readDirectoryAsync as jest.Mock).mockResolvedValueOnce(['abc', 'def'])
    ;(FS.getInfoAsync as jest.Mock)
      .mockResolvedValueOnce({ exists: true, size: 10 })
      .mockResolvedValueOnce({ exists: true, size: 20 })
    expect(await FileSystemRepo.totalBytes()).toBe(30)
  })
})
