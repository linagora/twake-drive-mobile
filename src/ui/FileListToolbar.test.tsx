import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context/jest/mock').default,
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 48 })
}))

import { FileListToolbar } from './FileListToolbar'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('FileListToolbar', () => {
  it('puts the sort control before the view toggle', () => {
    render(wrap(<FileListToolbar />))
    const toolbar = screen.getByTestId('file-list-toolbar')
    const labels = screen
      .getAllByRole('button')
      .map(b => (b.props as { testID?: string }).testID ?? 'sort')
    expect(toolbar).toBeTruthy()
    expect(labels).toEqual(['sort', 'view-toggle'])
  })

  it('leaves out the sort control when the screen is not sortable', () => {
    render(wrap(<FileListToolbar sortable={false} />))
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByTestId('view-toggle')).toBeTruthy()
  })

  // In landscape the navigation bar covers one edge: the view toggle sat under it.
  it('keeps clear of the navigation bar on both sides', () => {
    render(wrap(<FileListToolbar />))
    expect(screen.getByTestId('file-list-toolbar')).toHaveStyle({ paddingHorizontal: 56 })
  })
})
