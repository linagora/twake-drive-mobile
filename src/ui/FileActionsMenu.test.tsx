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

jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

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

// The real catalogue, so the label is read as a user hears it: with the key
// resolved and the name interpolated into it.
import '@/i18n'
import { FileActionsMenu } from './FileActionsMenu'
import type { FileItem } from './FileRow'

const file: FileItem = {
  _id: 'f1',
  name: 'rapport.pdf',
  size: 2_400_000,
  mime: 'application/pdf',
  updated_at: '2026-04-29T10:00:00.000Z'
}

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FileActionsMenu', () => {
  // Every row carried the same label, so a folder of 200 entries offered 200
  // controls a screen reader could not tell apart.
  it('names the file its actions belong to', () => {
    render(wrap(<FileActionsMenu file={file} onShare={jest.fn()} testID="menu" />))
    expect(screen.getByTestId('menu').props.accessibilityLabel).toContain('rapport.pdf')
  })

  it('does not fall back to the bare key', () => {
    render(wrap(<FileActionsMenu file={file} onShare={jest.fn()} testID="menu" />))
    expect(screen.getByTestId('menu').props.accessibilityLabel).not.toContain('a11y.')
  })

  describe('in the trash', () => {
    const open = (props: Partial<React.ComponentProps<typeof FileActionsMenu>>) => {
      render(
        wrap(
          <FileActionsMenu
            file={file}
            onRestore={jest.fn()}
            onDestroy={jest.fn()}
            canFavorite={false}
            testID="menu"
            {...props}
          />
        )
      )
      fireEvent.press(screen.getByTestId('menu'))
    }

    it('offers delete permanently and restore, without favorites', () => {
      open({})
      expect(screen.getByTestId('action-destroy')).toBeTruthy()
      expect(screen.getByTestId('action-restore')).toBeTruthy()
      expect(screen.queryByTestId('action-favorite')).toBeNull()
    })

    it('asks to delete when delete permanently is pressed', () => {
      const onDestroy = jest.fn()
      open({ onDestroy })
      fireEvent.press(screen.getByTestId('action-destroy'))
      expect(onDestroy).toHaveBeenCalledWith(file)
    })
  })
})
