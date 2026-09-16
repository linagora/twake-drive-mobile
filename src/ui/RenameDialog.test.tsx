import React from 'react'
import { Keyboard } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, render, screen } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

import { RenameDialog } from './RenameDialog'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

type KeyboardListener = (event: { endCoordinates: { height: number } }) => void

const listeners: Record<string, KeyboardListener> = {}

beforeEach(() => {
  jest.spyOn(Keyboard, 'addListener').mockImplementation(((
    name: string,
    listener: KeyboardListener
  ) => {
    listeners[name] = listener
    return { remove: jest.fn() }
  }) as unknown as typeof Keyboard.addListener)
})

afterEach(() => {
  jest.restoreAllMocks()
})

const renderDialog = (): void => {
  render(
    wrap(
      <RenameDialog
        visible
        initialName="notes.txt"
        type="file"
        onDismiss={jest.fn()}
        onSubmit={jest.fn().mockResolvedValue(undefined)}
      />
    )
  )
}

const dialogStyle = (): Record<string, unknown> => {
  const dialog = screen.getByText('drive.rename.titleFile')
  // The dialog surface is the closest ancestor carrying the margin we set.
  let node = dialog.parent
  while (node) {
    const style = node.props?.style as Record<string, unknown> | undefined
    if (style && 'marginBottom' in style) return style
    node = node.parent
  }
  return {}
}

describe('RenameDialog', () => {
  it('renders the input with the current name', () => {
    renderDialog()
    expect(screen.getByDisplayValue('notes.txt')).toBeOnTheScreen()
  })

  // The dialog sat under the keyboard inside the metadata page sheet, so the
  // user could not see what they were typing.
  it('lifts the dialog by the keyboard height while the keyboard is up', () => {
    renderDialog()
    act(() => listeners.keyboardDidShow({ endCoordinates: { height: 336 } }))
    expect(dialogStyle().marginBottom).toBe(336)
  })

  it('drops the offset again when the keyboard hides', () => {
    renderDialog()
    act(() => listeners.keyboardDidShow({ endCoordinates: { height: 336 } }))
    act(() => listeners.keyboardDidHide({ endCoordinates: { height: 0 } }))
    expect(dialogStyle().marginBottom).toBeUndefined()
  })
})
