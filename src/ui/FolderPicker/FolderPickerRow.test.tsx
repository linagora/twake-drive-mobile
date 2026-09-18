import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { FolderPickerRow } from './FolderPickerRow'

const folder = { _id: 'd1', name: 'Documents', type: 'directory' as const }
const file = { _id: 'f1', name: 'budget.xlsx', type: 'file' as const }

const show = (item: typeof folder | typeof file, disabled: boolean, onPress = jest.fn()) => {
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
})
