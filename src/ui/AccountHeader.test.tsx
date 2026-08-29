import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import { AccountHeader } from './AccountHeader'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('AccountHeader', () => {
  it('shows the name with the email underneath', () => {
    render(
      wrap(<AccountHeader name="Alice B" email="a@b.c" initials="AB" fallbackLabel="Compte" />)
    )
    expect(screen.getByText('Alice B')).toBeOnTheScreen()
    expect(screen.getByText('a@b.c')).toBeOnTheScreen()
    expect(screen.getByText('AB')).toBeOnTheScreen()
  })

  it('promotes the email to title when there is no name', () => {
    render(wrap(<AccountHeader email="solo@example.com" initials="S" fallbackLabel="Compte" />))
    expect(screen.getByText('solo@example.com')).toBeOnTheScreen()
    // No name means no separate subtitle line: the email appears exactly once.
    expect(screen.getAllByText('solo@example.com')).toHaveLength(1)
  })

  it('falls back to the provided label with neither name nor email', () => {
    render(wrap(<AccountHeader initials="U" fallbackLabel="Compte" />))
    expect(screen.getByText('Compte')).toBeOnTheScreen()
  })
})
