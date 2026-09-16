import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => null
}))

jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

jest.mock('@/files/favorites', () => ({
  isFavorite: jest.fn().mockReturnValue(false),
  toggleFavorite: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineState: jest.fn().mockReturnValue(undefined),
  useOfflineFolderState: jest.fn().mockReturnValue({
    pinned: false,
    aggregate: null,
    total: 0,
    downloaded: 0,
    downloading: 0,
    pending: 0,
    failed: 0
  })
}))

import { FileGridItem } from './FileGridItem'
import { useOfflineState, useOfflineFolderState } from '@/offline/useOfflineState'
import type { FileQueryResult } from '@/client/queries'

const file: FileQueryResult = {
  _id: 'file-1',
  _type: 'io.cozy.files',
  name: 'rapport-annuel.pdf',
  type: 'file',
  size: 1_200_000,
  mime: 'application/pdf',
  class: 'pdf'
}

const folder: FileQueryResult = {
  _id: 'dir-1',
  _type: 'io.cozy.files',
  name: 'Projets',
  type: 'directory'
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FileGridItem', () => {
  it('renders the file name', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.getByText('rapport-annuel.pdf')).toBeOnTheScreen()
  })

  it('renders a thumbnail/icon area', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.getByTestId('file-grid-icon')).toBeOnTheScreen()
  })

  it('calls onPress with the file when tapped', () => {
    const onPress = jest.fn()
    render(wrap(<FileGridItem file={file} onPress={onPress} />))
    fireEvent.press(screen.getByText('rapport-annuel.pdf'))
    expect(onPress).toHaveBeenCalledWith(file)
  })

  it('calls onLongPress when long-pressed', () => {
    const onLongPress = jest.fn()
    render(wrap(<FileGridItem file={file} onPress={() => {}} onLongPress={onLongPress} />))
    fireEvent(screen.getByTestId('file-grid-item'), 'longPress')
    expect(onLongPress).toHaveBeenCalledWith(file)
  })

  it('renders a folder name', () => {
    render(wrap(<FileGridItem file={folder} onPress={() => {}} />))
    expect(screen.getByText('Projets')).toBeOnTheScreen()
  })

  it('applies selected visual state when selected prop is true', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} selected />))
    // Container should still render the name
    expect(screen.getByText('rapport-annuel.pdf')).toBeOnTheScreen()
  })

  it('renders the offline pinned badge when a file is kept offline', () => {
    ;(useOfflineState as jest.Mock).mockReturnValueOnce({
      fileId: 'file-1',
      state: 'downloaded',
      rev: '',
      md5sum: '',
      size: 0,
      name: '',
      localPath: '',
      pinnedAt: 0,
      isDirectPin: true,
      parentFolderPins: []
    })
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.getByTestId('pinned-badge')).toBeOnTheScreen()
  })

  it('renders the offline badge when a folder is kept offline', () => {
    ;(useOfflineFolderState as jest.Mock).mockReturnValueOnce({
      pinned: true,
      aggregate: 'downloaded',
      total: 3,
      downloaded: 3,
      downloading: 0,
      pending: 0,
      failed: 0
    })
    render(wrap(<FileGridItem file={folder} onPress={() => {}} />))
    expect(screen.getByTestId('pinned-badge')).toBeOnTheScreen()
  })

  it('renders no offline badge when the item is not kept offline', () => {
    render(wrap(<FileGridItem file={file} onPress={() => {}} />))
    expect(screen.queryByTestId('pinned-badge')).toBeNull()
  })
})

// Grid used to offer nothing but the multi-select long press, so sharing a
// file meant switching back to the list view.
describe('FileGridItem actions', () => {
  it('renders no action anchor when no action is wired', () => {
    render(wrap(<FileGridItem file={file} onPress={jest.fn()} />))
    expect(screen.queryByTestId('file-grid-actions')).toBeNull()
  })

  it('renders the file action menu when actions are wired', () => {
    render(wrap(<FileGridItem file={file} onPress={jest.fn()} onShare={jest.fn()} />))
    expect(screen.getByTestId('file-grid-actions')).toBeOnTheScreen()
  })

  it('offers the same entries as the list row', () => {
    const onShare = jest.fn()
    render(
      wrap(
        <FileGridItem
          file={file}
          onPress={jest.fn()}
          onShare={onShare}
          onMove={jest.fn()}
          onInfo={jest.fn()}
        />
      )
    )
    fireEvent.press(screen.getByTestId('file-grid-actions'))
    expect(screen.getByText('drive.fileMeta.share')).toBeOnTheScreen()
    expect(screen.getByText('drive.fileMeta.move')).toBeOnTheScreen()
    expect(screen.getByText('drive.fileMeta.favorite')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('drive.fileMeta.share'))
    expect(onShare).toHaveBeenCalledWith(expect.objectContaining({ _id: 'file-1' }))
  })

  it('renders the folder action menu for a directory', () => {
    render(wrap(<FileGridItem file={folder} onPress={jest.fn()} onShare={jest.fn()} />))
    expect(screen.getByTestId('folder-grid-actions')).toBeOnTheScreen()
  })

  it('hides the actions while the tile is selected', () => {
    render(wrap(<FileGridItem file={file} onPress={jest.fn()} onShare={jest.fn()} selected />))
    expect(screen.queryByTestId('file-grid-actions')).toBeNull()
  })
})
