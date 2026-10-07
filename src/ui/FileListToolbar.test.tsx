import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
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
})
