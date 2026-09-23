import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

// The icons are svg paths; render the key instead so a row can be asserted on.
jest.mock('@/ui/icons/FileTypeIcon', () => ({
  FileTypeIcon: ({ icon }: { icon: string }) => {
    const { Text: RNText } = jest.requireActual('react-native')
    return <RNText>{`icon:${icon}`}</RNText>
  }
}))

import { FolderPickerRow, FolderPickerRowItem } from './FolderPickerRow'

const folder = { _id: 'd1', name: 'Documents', type: 'directory' as const }
const file = { _id: 'f1', name: 'budget.xlsx', type: 'file' as const }

const show = (item: FolderPickerRowItem, disabled: boolean, onPress = jest.fn()) => {
  render(
    <PaperProvider>
      <FolderPickerRow item={item} disabled={disabled} onPress={onPress} />
    </PaperProvider>
  )
  return onPress
}

describe('FolderPickerRow', () => {
  it('opens a folder that can receive the move', () => {
    const onPress = show(folder, false)
    fireEvent.press(screen.getByText('Documents'))
    expect(onPress).toHaveBeenCalledWith(folder)
  })

  it('shows a file dimmed rather than looking like a destination', () => {
    show(file, true)
    const title = screen.getByText('budget.xlsx')
    expect(JSON.stringify(title.props.style)).toContain('color')
  })

  it('does not answer a tap on a row that cannot receive the move', () => {
    const onPress = show(file, true)
    fireEvent.press(screen.getByText('budget.xlsx'))
    expect(onPress).not.toHaveBeenCalled()
  })

  // Every file carried the generic icon, which is the note icon in another
  // colour, so a picker full of spreadsheets looked full of notes (#274).
  it('gives a file the icon of its type', () => {
    show({ ...file, mime: 'application/vnd.ms-excel' }, true)
    expect(screen.getByText('icon:sheet')).toBeOnTheScreen()
  })

  it('falls back to the extension when the document carries no mime', () => {
    show({ _id: 'f2', name: 'report.pdf', type: 'file' }, true)
    expect(screen.getByText('icon:pdf')).toBeOnTheScreen()
  })

  it('keeps the folder icon for a folder', () => {
    show(folder, false)
    expect(screen.getByText('icon:folder')).toBeOnTheScreen()
  })
})
