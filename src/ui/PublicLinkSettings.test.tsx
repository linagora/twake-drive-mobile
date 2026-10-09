import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts ? `${key} ${JSON.stringify(opts)}` : key,
    i18n: { language: 'en' }
  })
}))

import { PublicLinkSettings } from './PublicLinkSettings'

const setup = (props: Partial<React.ComponentProps<typeof PublicLinkSettings>> = {}) => {
  const handlers = {
    onSavePassword: jest.fn(),
    onRemovePassword: jest.fn()
  }
  render(
    <PaperProvider>
      <PublicLinkSettings hasPassword={false} {...handlers} {...props} />
    </PaperProvider>
  )
  return handlers
}

describe('PublicLinkSettings', () => {
  it('offers to set, not to remove, when nothing is set', () => {
    setup()
    expect(screen.getByTestId('share-link-password-edit')).toHaveTextContent('drive.share.linkSet')
    expect(screen.getByTestId('share-link-password-edit').props.accessibilityLabel).toBe(
      'drive.share.linkPasswordSetLabel'
    )
    expect(screen.queryByTestId('share-link-password-remove')).toBeNull()
  })

  it('offers to change or remove what is set', () => {
    setup({ hasPassword: true })
    expect(screen.getByTestId('share-link-password-edit')).toHaveTextContent(
      'drive.share.linkChange'
    )
    expect(screen.getByTestId('share-link-password-remove')).toBeOnTheScreen()
  })

  it('masks the password, reveals it on demand, never prefilled', () => {
    setup({ hasPassword: true })
    fireEvent.press(screen.getByTestId('share-link-password-edit'))
    const input = screen.getByTestId('share-link-password-input')
    expect(input.props.value).toBe('')
    expect(input.props.secureTextEntry).toBe(true)
    fireEvent.press(screen.getByTestId('share-link-password-toggle'))
    expect(screen.getByTestId('share-link-password-input').props.secureTextEntry).toBe(false)
  })

  it('refuses a password shorter than 4 characters, once trimmed', () => {
    const { onSavePassword } = setup()
    fireEvent.press(screen.getByTestId('share-link-password-edit'))
    fireEvent.changeText(screen.getByTestId('share-link-password-input'), ' abc ')
    fireEvent.press(screen.getByTestId('share-link-password-submit'))
    expect(onSavePassword).not.toHaveBeenCalled()
  })

  it('hands over the password as typed, spaces included', () => {
    const { onSavePassword } = setup()
    fireEvent.press(screen.getByTestId('share-link-password-edit'))
    fireEvent.changeText(screen.getByTestId('share-link-password-input'), 'abcd ')
    fireEvent.press(screen.getByTestId('share-link-password-submit'))
    expect(onSavePassword).toHaveBeenCalledWith('abcd ')
  })

  it('reports the removal of the password', () => {
    const { onRemovePassword } = setup({ hasPassword: true })
    fireEvent.press(screen.getByTestId('share-link-password-remove'))
    expect(onRemovePassword).toHaveBeenCalled()
  })

  it('disables the controls while a change is in flight', () => {
    setup({ hasPassword: true, disabled: true })
    expect(screen.getByTestId('share-link-password-edit')).toBeDisabled()
  })
})
