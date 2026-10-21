import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'
import '@/i18n'

const mockDismissTo = jest.fn()
const mockDispatch = jest.fn()
let mockRootState: unknown
jest.mock('expo-router', () => ({
  useRouter: () => ({ dismissTo: mockDismissTo }),
  useNavigationContainerRef: () => ({
    getRootState: () => mockRootState,
    dispatch: mockDispatch
  })
}))

import NotFound from './+not-found'

const renderAndLeave = () => {
  render(
    <PaperProvider>
      <NotFound />
    </PaperProvider>
  )
  expect(screen.getByText('Ce lien ne mène nulle part')).toBeOnTheScreen()
  fireEvent.press(screen.getByText('Aller à Mon Drive'))
}

describe('NotFound', () => {
  beforeEach(() => jest.clearAllMocks())

  it('says the link leads nowhere and goes back to the drive', () => {
    mockRootState = { routes: [{ name: '(drive)' }, { name: '+not-found' }] }
    renderAndLeave()
    expect(mockDismissTo).toHaveBeenCalledWith('/(drive)/files')
    expect(mockDispatch).not.toHaveBeenCalled()
  })

  it('lands on the drive root, not on the folder left open in it', () => {
    const folder = { name: '[...path]' }
    mockRootState = {
      routes: [
        {
          name: '__root',
          state: {
            routes: [
              {
                name: '(drive)',
                state: {
                  routes: [
                    {
                      name: 'files',
                      state: { key: 'files-stack', routes: [folder, folder, folder] }
                    },
                    { name: 'favorites' }
                  ]
                }
              },
              { name: '+not-found' }
            ]
          }
        }
      ]
    }
    renderAndLeave()
    expect(mockDispatch).toHaveBeenCalledWith({ type: 'POP_TO_TOP', target: 'files-stack' })
    expect(mockDismissTo).toHaveBeenCalledWith('/(drive)/files')
  })
})
