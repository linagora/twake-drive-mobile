import React from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import '@/i18n'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false }
}))

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

const mockLogin = jest.fn()
jest.mock('@/auth/useAuth', () => ({ useAuth: () => ({ login: mockLogin }) }))

import LoginScreen from './login'

describe('LoginScreen', () => {
  it('drops the error as soon as the address changes', async () => {
    mockLogin.mockRejectedValueOnce(new Error('DOMAIN_UNSUPPORTED'))
    render(
      <PaperProvider>
        <LoginScreen />
      </PaperProvider>
    )
    const input = screen.getByTestId('login-email-input')
    fireEvent.changeText(input, 'someone@example.org')
    await act(async () => {
      fireEvent(input, 'submitEditing')
    })
    expect(screen.getByText('Ce domaine ne supporte pas Twake Drive.')).toBeOnTheScreen()
    fireEvent.changeText(input, 'abc')
    expect(screen.queryByText('Ce domaine ne supporte pas Twake Drive.')).toBeNull()
  })
})
