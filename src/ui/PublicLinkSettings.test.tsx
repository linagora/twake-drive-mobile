import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { format } from 'date-fns'
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
    onRemovePassword: jest.fn(),
    onSaveExpiry: jest.fn(),
    onClearExpiry: jest.fn()
  }
  render(
    <PaperProvider>
      <PublicLinkSettings hasPassword={false} expiresAt={null} {...handlers} {...props} />
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
    expect(screen.getByTestId('share-link-expiry-edit').props.accessibilityLabel).toBe(
      'drive.share.linkExpirySetLabel'
    )
    expect(screen.queryByTestId('share-link-password-remove')).toBeNull()
    expect(screen.queryByTestId('share-link-expiry-clear')).toBeNull()
  })

  it('offers to change or remove what is set', () => {
    setup({ hasPassword: true, expiresAt: new Date('2099-05-01T12:00:00Z') })
    expect(screen.getByTestId('share-link-password-edit')).toHaveTextContent(
      'drive.share.linkChange'
    )
    expect(screen.getByTestId('share-link-password-remove')).toBeOnTheScreen()
    expect(screen.getByTestId('share-link-expiry-clear')).toBeOnTheScreen()
  })

  it('tells the buttons of the password and of the deadline apart for a screen reader', () => {
    setup({ hasPassword: true, expiresAt: new Date('2099-05-01T12:00:00Z') })
    const label = (id: string) => screen.getByTestId(id).props.accessibilityLabel
    expect(label('share-link-password-edit')).toBe('drive.share.linkPasswordChangeLabel')
    expect(label('share-link-password-remove')).toBe('drive.share.linkPasswordRemoveLabel')
    expect(label('share-link-expiry-edit')).toBe('drive.share.linkExpiryChangeLabel')
    expect(label('share-link-expiry-clear')).toBe('drive.share.linkExpiryRemoveLabel')
  })

  it('says a past deadline has expired', () => {
    setup({ expiresAt: new Date('2001-05-01T12:00:00Z') })
    expect(screen.getByTestId('share-link-expiry-state')).toHaveTextContent(
      /drive\.share\.linkExpiredOn/
    )
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

  it('reports the removal of the password and of the deadline', () => {
    const { onRemovePassword, onClearExpiry } = setup({
      hasPassword: true,
      expiresAt: new Date('2099-05-01T12:00:00Z')
    })
    fireEvent.press(screen.getByTestId('share-link-password-remove'))
    fireEvent.press(screen.getByTestId('share-link-expiry-clear'))
    expect(onRemovePassword).toHaveBeenCalled()
    expect(onClearExpiry).toHaveBeenCalled()
  })

  it('hands over the picked day, and offers no day before today', () => {
    const { onSaveExpiry } = setup()
    fireEvent.press(screen.getByTestId('share-link-expiry-edit'))
    const today = new Date()
    const key = (d: Date) => format(d, 'yyyy-MM-dd')
    expect(screen.getByTestId(`date-picker-day-${key(today)}`)).toBeEnabled()
    if (today.getDate() > 1) {
      const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
      expect(screen.getByTestId(`date-picker-day-${key(yesterday)}`)).toBeDisabled()
    }
    fireEvent.press(screen.getByTestId(`date-picker-day-${key(today)}`))
    fireEvent.press(screen.getByTestId('date-picker-confirm'))
    expect(onSaveExpiry).toHaveBeenCalledTimes(1)
    expect(key(onSaveExpiry.mock.calls[0][0])).toBe(key(today))
  })

  it('disables the controls while a change is in flight', () => {
    setup({ hasPassword: true, disabled: true })
    expect(screen.getByTestId('share-link-password-edit')).toBeDisabled()
    expect(screen.getByTestId('share-link-expiry-edit')).toBeDisabled()
  })
})
