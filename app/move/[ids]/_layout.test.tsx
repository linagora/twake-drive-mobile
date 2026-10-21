import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

import i18n from '@/i18n'
import { SnackbarHost, SnackbarOutlet } from '@/ui/SnackbarHost'

const mockBack = jest.fn()

// The nested Stack stands in for the picker: one button that moves into a folder.
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: mockBack, canGoBack: () => true }),
  useLocalSearchParams: () => ({ ids: 'f1' }),
  Stack: () => {
    const { Button } = require('react-native-paper')
    const ctx = require('@/drive/moveContext').useMoveContext()
    return <Button onPress={() => ctx.onConfirm({ _id: 'dest1', name: 'Docs' })}>Move here</Button>
  }
}))

jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({}),
  useQuery: () => ({
    data: [{ _id: 'f1', name: 'a.txt', type: 'file', dir_id: 'root' }],
    fetchStatus: 'loaded',
    fetch: jest.fn()
  })
}))
jest.mock('@/client/queries', () => ({
  filesByIdsQuery: jest.fn(),
  filesByIdsQueryAs: jest.fn()
}))
jest.mock('@/files/moveEntry', () => ({ moveEntry: jest.fn().mockResolvedValue(undefined) }))
jest.mock('@/files/optimisticFiles', () => ({ optimisticFiles: () => jest.fn() }))

import MoveLayout from './_layout'

const Harness = ({ open }: { open: boolean }) => (
  <PaperProvider>
    <SafeAreaProvider>
      <SnackbarHost>
        <SnackbarOutlet />
        {open && <MoveLayout />}
      </SnackbarHost>
    </SafeAreaProvider>
  </PaperProvider>
)

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

test('the move confirmation outlives the sheet it closes', async () => {
  const { getByText, rerender } = render(<Harness open />)
  fireEvent.press(getByText('Move here'))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
  rerender(<Harness open={false} />)
  expect(getByText('File moved')).toBeTruthy()
})
