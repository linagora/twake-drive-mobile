import React from 'react'
import { render } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: () => false },
  Redirect: () => null
}))

jest.mock('react-native-safe-area-context', () => ({
  ...jest.requireActual('react-native-safe-area-context'),
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 })
}))

jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ loginWithInstance: jest.fn() })
}))

let mockOutcome: string | null = null
jest.mock('@/auth/storeCertification', () => ({
  readLastAttestationOutcome: () => mockOutcome
}))

import DevInstanceScreen from './dev-instance'

const renderScreen = () =>
  render(
    <PaperProvider>
      <DevInstanceScreen />
    </PaperProvider>
  )

describe('DevInstanceScreen', () => {
  beforeEach(() => {
    mockOutcome = null
  })

  it('shows what the last attestation attempt failed on', () => {
    mockOutcome = '2026-09-24T04:43:31Z DCError 2: cannot-attest'
    const { getByTestId } = renderScreen()
    expect(getByTestId('dev-instance-attestation').props.children).toContain('cannot-attest')
  })

  it('says nothing about attestation when the last attempt went through', () => {
    const { queryByTestId } = renderScreen()
    expect(queryByTestId('dev-instance-attestation')).toBeNull()
  })
})
