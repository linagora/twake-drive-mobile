import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

import { ConfirmDialog } from './ConfirmDialog'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const setup = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) => {
  const onConfirm = jest.fn()
  const onDismiss = jest.fn()
  render(
    wrap(
      <ConfirmDialog
        visible
        title="Tout supprimer"
        message="Irréversible"
        onConfirm={onConfirm}
        onDismiss={onDismiss}
        {...props}
      />
    )
  )
  return { onConfirm, onDismiss }
}

describe('ConfirmDialog', () => {
  it('shows the title and message', () => {
    setup()
    expect(screen.getByText('Tout supprimer')).toBeOnTheScreen()
    expect(screen.getByText('Irréversible')).toBeOnTheScreen()
  })

  it('confirms and dismisses through the matching actions', () => {
    const { onConfirm, onDismiss } = setup()
    fireEvent.press(screen.getByTestId('confirm-dialog-submit'))
    expect(onConfirm).toHaveBeenCalledTimes(1)
    fireEvent.press(screen.getByTestId('confirm-dialog-cancel'))
    expect(onDismiss).toHaveBeenCalledTimes(1)
  })

  it('locks both actions while the confirmed work is running', () => {
    const { onConfirm, onDismiss } = setup({ loading: true })
    fireEvent.press(screen.getByTestId('confirm-dialog-submit'))
    fireEvent.press(screen.getByTestId('confirm-dialog-cancel'))
    expect(onConfirm).not.toHaveBeenCalled()
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('renders nothing while not visible', () => {
    setup({ visible: false })
    expect(screen.queryByText('Tout supprimer')).toBeNull()
  })

  it('scopes its testIDs so several dialogs can coexist', () => {
    setup({ testID: 'offline-delete-all-dialog' })
    expect(screen.getByTestId('offline-delete-all-dialog-submit')).toBeOnTheScreen()
  })
})
