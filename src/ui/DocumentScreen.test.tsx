import React from 'react'
import { Platform, StatusBar, Text } from 'react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { act, fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() })
}))

jest.mock('@/account/useCurrentUser', () => ({
  __esModule: true,
  useCurrentUser: () => ({ initials: 'QV', avatarUrl: null })
}))

import { DOCUMENT_CHROME_TEST_ID, DOCUMENT_CONTENT_TEST_ID, DocumentScreen } from './DocumentScreen'
import { CHROME_VISIBLE_MS } from './useAutoHidingChrome'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('DocumentScreen', () => {
  it('frames a document on the canvas by default', () => {
    const onBack = jest.fn()
    render(
      wrap(
        <DocumentScreen title="rapport.pdf" onBack={onBack}>
          <Text>content</Text>
        </DocumentScreen>
      )
    )
    expect(screen.getByText('rapport.pdf')).toBeOnTheScreen()
    expect(screen.getByText('content')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-back-button'))

    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('leaves the title to the web editor on an editor screen', () => {
    const onBack = jest.fn()
    render(
      wrap(
        <DocumentScreen onBack={onBack} chrome="editor">
          <Text>editor</Text>
        </DocumentScreen>
      )
    )
    expect(screen.queryByText('rapport.pdf')).not.toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-back-button'))
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('keeps the immersive content clear of the status bar on Android', () => {
    Platform.OS = 'android'
    StatusBar.currentHeight = 24
    render(
      wrap(
        <DocumentScreen title="rapport.pdf" onBack={jest.fn()} chrome="immersive">
          <Text>content</Text>
        </DocumentScreen>
      )
    )
    const content = screen.getByTestId(DOCUMENT_CONTENT_TEST_ID)
    expect(JSON.stringify(content.props.style)).toContain('"paddingTop":24')
    Platform.OS = 'ios'
  })

  // The bar sits over the document, so it steps aside once it has been read
  // and comes back on the next touch (#274).
  describe('the floating bar', () => {
    beforeEach(() => jest.useFakeTimers())
    afterEach(() => jest.useRealTimers())

    const show = (): void => {
      render(
        wrap(
          <DocumentScreen title="rapport.pdf" onBack={jest.fn()}>
            <Text>content</Text>
          </DocumentScreen>
        )
      )
    }

    it('is there when the document opens', () => {
      show()
      expect(screen.getByTestId(DOCUMENT_CHROME_TEST_ID).props.pointerEvents).toBe('box-none')
    })

    it('steps aside once nothing has happened', () => {
      show()

      act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS))

      expect(screen.getByTestId(DOCUMENT_CHROME_TEST_ID).props.pointerEvents).toBe('none')
    })

    it('comes back when the document is touched', () => {
      show()
      act(() => jest.advanceTimersByTime(CHROME_VISIBLE_MS))

      act(() => {
        fireEvent(screen.getByTestId(DOCUMENT_CONTENT_TEST_ID), 'startShouldSetResponderCapture')
      })

      expect(screen.getByTestId(DOCUMENT_CHROME_TEST_ID).props.pointerEvents).toBe('box-none')
    })

    it('lets the touch through to the document', () => {
      show()
      const answer = fireEvent(
        screen.getByTestId(DOCUMENT_CONTENT_TEST_ID),
        'startShouldSetResponderCapture'
      )

      expect(answer).toBe(false)
    })
  })
})
