const mockFlag = jest.fn()
jest.mock('cozy-flags', () => ({
  __esModule: true,
  default: (name: string) => mockFlag(name)
}))

import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({ getStackClient: () => ({ uri: undefined }), links: [] })
}))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined)
}))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => mockOnline
}))

jest.mock('@/files/favorites', () => ({
  isFavorite: jest.fn().mockReturnValue(false),
  toggleFavorite: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/files/download', () => ({
  download: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

import { useOfflineState } from '@/offline/useOfflineState'
import { isFavorite, toggleFavorite } from '@/files/favorites'
import { download } from '@/files/download'
import { FileRow, FileItem } from './FileRow'

const file: FileItem = {
  _id: 'f1',
  name: 'rapport.pdf',
  size: 2_400_000,
  mime: 'application/pdf',
  updated_at: '2026-04-29T10:00:00.000Z'
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

afterEach(() => {
  mockOnline = true
  ;(useOfflineState as jest.Mock).mockReturnValue(undefined)
})

// The menu of a row is addressed by the name it belongs to, so a list can be
// driven row by row (same convention as the folder rows).
const FILE_MENU = 'file-actions:rapport.pdf'

describe('FileRow', () => {
  beforeEach(() => mockFlag.mockReturnValue(undefined))

  it('renders the file name', () => {
    render(wrap(<FileRow file={file} onPress={() => {}} />))
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('calls onPress with the file when tapped', () => {
    const onPress = jest.fn()
    render(wrap(<FileRow file={file} onPress={onPress} />))
    fireEvent.press(screen.getByText('rapport.pdf'))
    expect(onPress).toHaveBeenCalledWith(file)
  })

  it('renders a 3-dot menu trigger when onTogglePin is provided', () => {
    render(wrap(<FileRow file={file} onPress={jest.fn()} onTogglePin={jest.fn()} />))
    expect(screen.getByTestId(FILE_MENU)).toBeOnTheScreen()
  })

  it('drops the menu when keep-offline is off and it was its only action', () => {
    mockFlag.mockReturnValue(false)
    render(wrap(<FileRow file={file} onPress={jest.fn()} onTogglePin={jest.fn()} />))
    expect(screen.queryByTestId(FILE_MENU)).toBeNull()
  })

  it('exposes testIDs for Maestro selection', () => {
    render(
      wrap(<FileRow file={file} onPress={() => {}} onTogglePin={jest.fn()} testID="file-row" />)
    )
    expect(screen.getByTestId('file-row')).toBeOnTheScreen()
    expect(screen.getByTestId(FILE_MENU)).toBeOnTheScreen()
  })

  it('renders a Move… menu item when onMove is provided', () => {
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={jest.fn()} />))
    expect(screen.getByTestId(FILE_MENU)).toBeOnTheScreen()
  })

  it('calls onMove when the menu item is tapped', () => {
    const onMove = jest.fn()
    render(wrap(<FileRow file={file} onPress={() => {}} onMove={onMove} />))
    fireEvent.press(screen.getByTestId(FILE_MENU))
    fireEvent.press(screen.getByText('drive.fileMeta.move'))
    expect(onMove).toHaveBeenCalledWith(file)
  })

  describe('favorite menu item', () => {
    it('shows "Add to favorites" label when file is not a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.favorite')).toBeOnTheScreen()
    })

    it('shows "Remove from favorites" label when file is a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.unfavorite')).toBeOnTheScreen()
    })

    it('calls toggleFavorite when the favorite menu item is tapped', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      fireEvent.press(screen.getByText('drive.fileMeta.favorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), file, true)
    })

    // The flag is persisted through the stack, so offline the toggle cannot
    // reach anything: the file never showed up in Favoris afterwards.
    it('disables the favorite action while offline', () => {
      mockOnline = false
      ;(isFavorite as jest.Mock).mockReturnValue(false)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.favorite')).toBeDisabled()
    })

    it('calls toggleFavorite with next=false when file is already a favorite', () => {
      ;(isFavorite as jest.Mock).mockReturnValue(true)
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      fireEvent.press(screen.getByText('drive.fileMeta.unfavorite'))
      expect(toggleFavorite).toHaveBeenCalledWith(expect.anything(), file, false)
    })
  })

  describe('download menu item', () => {
    it('shows "Télécharger" label in the menu', () => {
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.download')).toBeOnTheScreen()
    })

    it('calls download when the download menu item is tapped', () => {
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      fireEvent.press(screen.getByText('drive.fileMeta.download'))
      expect(download).toHaveBeenCalledWith(expect.anything(), file, undefined)
    })

    it('downloads through the drive route when the row belongs to a shared drive', () => {
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} driveId="drive-1" />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      fireEvent.press(screen.getByText('drive.fileMeta.download'))
      expect(download).toHaveBeenCalledWith(expect.anything(), file, 'drive-1')
    })

    // Offline a download has nothing to read unless the file is already kept
    // offline, and it was the one action left black in a greyed menu (#294).
    it('is out of reach offline on a file that is not kept offline', () => {
      mockOnline = false
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.download')).toBeDisabled()
    })

    it('stays available offline on a file kept offline', () => {
      mockOnline = false
      ;(useOfflineState as jest.Mock).mockReturnValue({
        fileId: 'f1',
        state: 'downloaded',
        isDirectPin: true
      })
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      fireEvent.press(screen.getByText('drive.fileMeta.download'))
      expect(download).toHaveBeenCalledWith(expect.anything(), file, undefined)
    })

    it('is out of reach offline while the copy is still downloading', () => {
      mockOnline = false
      ;(useOfflineState as jest.Mock).mockReturnValue({
        fileId: 'f1',
        state: 'downloading',
        isDirectPin: true
      })
      render(wrap(<FileRow file={file} onPress={() => {}} onShare={jest.fn()} />))
      fireEvent.press(screen.getByTestId(FILE_MENU))
      expect(screen.getByText('drive.fileMeta.download')).toBeDisabled()
    })
  })
})
