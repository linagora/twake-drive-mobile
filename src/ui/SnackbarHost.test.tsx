import React from 'react'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Button, Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import { SnackbarHost, SnackbarOutlet, useNotify, withSnackbarOutlet } from '@/ui/SnackbarHost'

const Notifier = () => {
  const notify = useNotify()
  return <Button onPress={() => notify('File moved')}>notify</Button>
}

beforeEach(() => jest.useFakeTimers())
afterEach(() => jest.useRealTimers())

test('a repeated message gets its full duration again', () => {
  const { getByText, queryByText } = render(
    <PaperProvider>
      <SafeAreaProvider>
        <SnackbarHost>
          <Notifier />
          <SnackbarOutlet />
        </SnackbarHost>
      </SafeAreaProvider>
    </PaperProvider>
  )
  fireEvent.press(getByText('notify'))
  act(() => jest.advanceTimersByTime(2500))
  fireEvent.press(getByText('notify'))
  act(() => jest.advanceTimersByTime(2500))
  expect(queryByText('File moved')).toBeTruthy()
  act(() => jest.advanceTimersByTime(2000))
  expect(queryByText('File moved')).toBeNull()
})

describe('withSnackbarOutlet', () => {
  const NotifyOnMount = () => {
    const notify = useNotify()
    React.useEffect(() => notify('File imported'), [notify])
    return null
  }
  const renderScreen = (name: string) =>
    render(
      <PaperProvider>
        <SafeAreaProvider>
          <SnackbarHost>
            {withSnackbarOutlet({ route: { name }, children: <NotifyOnMount /> })}
          </SnackbarHost>
        </SafeAreaProvider>
      </PaperProvider>
    )

  // A share can be imported over any screen, and closes back onto it.
  it.each(['search', 'settings', 'share', 'preview/[fileId]', 'metadata/[fileId]'])(
    'shows the confirmation over %s',
    name => {
      expect(renderScreen(name).queryByText('File imported')).toBeTruthy()
    }
  )

  it.each(['(drive)', 'move/[ids]', 'import'])('adds no second outlet to %s', name => {
    expect(renderScreen(name).queryByText('File imported')).toBeNull()
  })
})
