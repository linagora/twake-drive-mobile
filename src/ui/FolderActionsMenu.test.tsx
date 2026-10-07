import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({ getStackClient: () => ({ uri: undefined }), links: [] })
}))

jest.mock('@/offline/useOfflineState', () => ({
  useOfflineFolderState: jest.fn().mockReturnValue({ pinned: false, aggregate: null })
}))

jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))

jest.mock('@/files/favorites', () => ({
  isFavorite: jest.fn().mockReturnValue(false),
  toggleFavorite: jest.fn().mockResolvedValue(undefined)
}))

jest.mock('@/pouchdb/triggerReplication', () => ({
  triggerPouchReplication: jest.fn()
}))

// The real catalogue, so the label is read as a user hears it: with the key
// resolved and the name interpolated into it.
import '@/i18n'
import { FolderActionsMenu } from './FolderActionsMenu'
import type { FolderItem } from './FolderRow'

const folder: FolderItem = { _id: 'd1', name: 'Projets' }

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FolderActionsMenu', () => {
  it('names the folder its actions belong to', () => {
    render(wrap(<FolderActionsMenu folder={folder} onShare={jest.fn()} testID="menu" />))
    expect(screen.getByTestId('menu').props.accessibilityLabel).toContain('Projets')
  })

  it('does not fall back to the bare key', () => {
    render(wrap(<FolderActionsMenu folder={folder} onShare={jest.fn()} testID="menu" />))
    expect(screen.getByTestId('menu').props.accessibilityLabel).not.toContain('a11y.')
  })

  describe('in the trash', () => {
    const open = (props: Partial<React.ComponentProps<typeof FolderActionsMenu>>) => {
      render(
        wrap(
          <FolderActionsMenu
            folder={folder}
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
      expect(onDestroy).toHaveBeenCalledWith(folder)
    })
  })
})
