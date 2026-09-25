import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Text } from 'react-native'

const mockRedirect = jest.fn()

jest.mock('expo-router', () => ({
  Redirect: (props: { href: string }) => {
    mockRedirect(props.href)
    return null
  },
  Stack: () => <></>
}))

let mockStatus = 'unauthenticated'
jest.mock('@/auth/useAuth', () => ({
  useAuth: () => ({ status: mockStatus })
}))

import AuthLayout from './_layout'

beforeEach(() => {
  mockRedirect.mockClear()
})

describe('AuthLayout', () => {
  // The drive layout guards its side; without the mirror here a session that
  // is restored while the router sits on the auth stack has nothing to send it
  // back, and the user keeps looking at the login screen while signed in.
  it('sends an authenticated user back to the drive', () => {
    mockStatus = 'authenticated'
    render(<AuthLayout />)
    expect(mockRedirect).toHaveBeenCalledWith('/(drive)/files')
  })

  it('leaves the auth stack in place while there is no session', () => {
    mockStatus = 'unauthenticated'
    render(<AuthLayout />)
    expect(mockRedirect).not.toHaveBeenCalled()
  })

  it('leaves the auth stack in place while the session is still being read', () => {
    mockStatus = 'loading'
    render(<AuthLayout />)
    expect(mockRedirect).not.toHaveBeenCalled()
  })
})
