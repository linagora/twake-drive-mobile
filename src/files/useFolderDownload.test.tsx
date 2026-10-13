const mockDownloadFolder = jest.fn()
jest.mock('./download', () => ({
  downloadFolder: (...args: unknown[]) => mockDownloadFolder(...args),
  DownloadCancelledError: class DownloadCancelledError extends Error {}
}))

const mockClient = {}
jest.mock('cozy-client', () => ({ useClient: () => mockClient }))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

import { act, renderHook } from '@testing-library/react-native'

import { DownloadCancelledError } from './download'
import { useFolderDownload } from './useFolderDownload'

const folder = { _id: 'd1', name: 'Dossier' }
const setup = () => {
  const notify = jest.fn()
  const { result } = renderHook(() => useFolderDownload('Test', notify))
  return { notify, download: result.current }
}

describe('useFolderDownload', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
    mockDownloadFolder.mockResolvedValue(undefined)
    jest.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  it('says the zip is being prepared and downloads the folder', async () => {
    const { notify, download } = setup()
    await act(async () => download(folder))
    expect(notify).toHaveBeenCalledWith('drive.folderZipPreparing')
    expect(mockDownloadFolder).toHaveBeenCalledWith(mockClient, folder)
  })

  it('tells the download started once the system has it, on Android', async () => {
    mockDownloadFolder.mockResolvedValue('queued')
    const { notify, download } = setup()
    await act(async () => download(folder))
    expect(notify).toHaveBeenLastCalledWith('drive.folderZipStarted')
  })

  it('has nothing more to say once the system sheet is up, on iOS', async () => {
    mockDownloadFolder.mockResolvedValue('opened')
    const { notify, download } = setup()
    await act(async () => download(folder))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('refuses offline, without downloading', () => {
    mockOnline = false
    const { notify, download } = setup()
    download(folder)
    expect(notify).toHaveBeenCalledWith('drive.offline.requiresOnline')
    expect(mockDownloadFolder).not.toHaveBeenCalled()
  })

  it('tells when the download fails', async () => {
    mockDownloadFolder.mockRejectedValue(new Error('HTTP 500'))
    const { notify, download } = setup()
    await act(async () => download(folder))
    expect(notify).toHaveBeenLastCalledWith('errors.generic')
  })

  it('stays silent when the user cancels', async () => {
    mockDownloadFolder.mockRejectedValue(new DownloadCancelledError())
    const { notify, download } = setup()
    await act(async () => download(folder))
    expect(notify).toHaveBeenCalledTimes(1)
  })

  it('ignores a second tap while the first download runs', async () => {
    let done: () => void = () => undefined
    mockDownloadFolder.mockReturnValue(new Promise<void>(resolve => (done = resolve)))
    const { download } = setup()
    download(folder)
    download(folder)
    expect(mockDownloadFolder).toHaveBeenCalledTimes(1)
    await act(async () => {
      done()
    })
    await act(async () => download(folder))
    expect(mockDownloadFolder).toHaveBeenCalledTimes(2)
  })
})
