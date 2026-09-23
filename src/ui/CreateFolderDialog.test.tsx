import React from 'react'
import { Keyboard } from 'react-native'
import { act, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

import { CreateFolderDialog } from './CreateFolderDialog'

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

const dialogStyle = (): Record<string, unknown> => {
  let node = screen.getByTestId('create-folder-submit').parent
  while (node) {
    const style = node.props?.style as Record<string, unknown> | undefined
    if (style && 'marginBottom' in style) return style
    node = node.parent
  }
  return {}
}

describe('CreateFolderDialog', () => {
  it('expose les testIDs du champ et du bouton pour Maestro', () => {
    render(wrap(<CreateFolderDialog visible onDismiss={jest.fn()} onSubmit={jest.fn()} />))
    expect(screen.getByTestId('create-folder-name-input')).toBeOnTheScreen()
    expect(screen.getByTestId('create-folder-submit')).toBeOnTheScreen()
  })

  // Cancel and Create sat under the keyboard and could not be reached (#170).
  it('lifts the dialog by the keyboard height while the keyboard is up', () => {
    render(wrap(<CreateFolderDialog visible onDismiss={jest.fn()} onSubmit={jest.fn()} />))
    act(() => listeners.keyboardDidShow({ endCoordinates: { height: 336 } }))
    expect(dialogStyle().marginBottom).toBe(336)
  })

  it('drops the offset again when the keyboard hides', () => {
    render(wrap(<CreateFolderDialog visible onDismiss={jest.fn()} onSubmit={jest.fn()} />))
    act(() => listeners.keyboardDidShow({ endCoordinates: { height: 336 } }))
    act(() => listeners.keyboardDidHide({ endCoordinates: { height: 0 } }))
    expect(dialogStyle().marginBottom).toBeUndefined()
  })
})
