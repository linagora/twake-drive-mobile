import React from 'react'
import { Keyboard } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

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

// The dialog stays mounted between openings, so it has to take the name of the
// item it is opened for, not the one it was first rendered with (#267).
describe('RenameDialog reopened for another item', () => {
  const renderClosed = (): ReturnType<typeof render> =>
    render(
      wrap(
        <RenameDialog
          visible={false}
          initialName=""
          type="file"
          onDismiss={jest.fn()}
          onSubmit={jest.fn().mockResolvedValue(undefined)}
        />
      )
    )

  const close = (view: ReturnType<typeof render>, initialName: string): void =>
    view.rerender(
      wrap(
        <RenameDialog
          visible={false}
          initialName={initialName}
          type="file"
          onDismiss={jest.fn()}
          onSubmit={jest.fn().mockResolvedValue(undefined)}
        />
      )
    )

  const rerenderWith = (view: ReturnType<typeof render>, initialName: string): void =>
    view.rerender(
      wrap(
        <RenameDialog
          visible
          initialName={initialName}
          type="file"
          onDismiss={jest.fn()}
          onSubmit={jest.fn().mockResolvedValue(undefined)}
        />
      )
    )

  it('shows the name of the item it is opened for', () => {
    const view = renderClosed()
    rerenderWith(view, 'b.txt')
    expect(screen.getByDisplayValue('b.txt')).toBeOnTheScreen()
  })

  it('drops what was typed for the previous item', () => {
    const view = renderClosed()
    rerenderWith(view, 'a.ogg')
    fireEvent.changeText(screen.getByTestId('rename-name-input'), 'new-a.ogg')
    close(view, 'a.ogg')
    rerenderWith(view, 'b.txt')

    expect(screen.getByDisplayValue('b.txt')).toBeOnTheScreen()
  })

  it('keeps submit disabled until the name is actually changed', () => {
    const view = renderClosed()
    rerenderWith(view, 'a.ogg')
    fireEvent.changeText(screen.getByTestId('rename-name-input'), 'new-a.ogg')
    close(view, 'a.ogg')
    rerenderWith(view, 'b.txt')

    expect(screen.getByTestId('rename-submit')).toBeDisabled()
  })
})

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
