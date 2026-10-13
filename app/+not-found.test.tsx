import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import '@/i18n'

const mockDismissTo = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ dismissTo: mockDismissTo }) }))

import NotFound from './+not-found'

describe('NotFound', () => {
  it('says the link leads nowhere and goes back to the drive', () => {
    render(
      <PaperProvider>
        <NotFound />
      </PaperProvider>
    )
    expect(screen.getByText('Ce lien ne mène nulle part')).toBeOnTheScreen()
    fireEvent.press(screen.getByText('Aller à Mon Drive'))
    expect(mockDismissTo).toHaveBeenCalledWith('/(drive)/files')
  })
})
