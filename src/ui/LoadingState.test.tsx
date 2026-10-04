import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import '@/i18n'

import { LoadingState } from './LoadingState'

describe('LoadingState', () => {
  // A bare spinner is announced as an unnamed progress bar: name it, so a
  // screen reader user knows the screen is loading rather than empty.
  it('names its spinner', () => {
    render(
      <PaperProvider>
        <LoadingState />
      </PaperProvider>
    )
    expect(screen.getByLabelText('Chargement…')).toBeOnTheScreen()
  })
})
