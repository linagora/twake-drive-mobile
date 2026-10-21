import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'

// Real react-i18next is used (not mocked) so the confirm button shows the
// actual "Import here" copy. expo-localization is globally mocked to `fr`
// in jest.setup.ts, so the active language must be forced to English here —
// otherwise `t('drive.import.confirm')` resolves to the French string.
import i18n from '@/i18n'

const mockBack = jest.fn()
const mockPush = jest.fn()
const mockReplace = jest.fn()

// expo-router isn't globally mocked in this repo (see app/metadata/[fileId].test.tsx);
// each suite mocks it locally. Stack is never actually rendered here — ImportLayout
// is given `children`, which short-circuits the `children ?? <Stack .../>` fallback.
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({
    back: mockBack,
    push: mockPush,
    replace: mockReplace,
    canGoBack: () => true
  })
}))

// The real cozy-client package does not work under this Jest environment
// (see FolderPicker.test.tsx / metadata/[fileId].test.tsx for the same
// pattern) — useClient() throws without it, so it is always mocked locally.
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => ({})
}))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

// See mockBack/mockPush note above re: the `mock`-prefix hoisting requirement.
const mockUploadBatch = jest.fn()
jest.mock('@/share/uploadBatch', () => ({
  uploadBatch: (...a: unknown[]) => mockUploadBatch(...a)
}))
jest.mock('@/share/PendingShareProvider', () => ({
  usePendingShare: () => ({
    items: [{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }],
    clear: jest.fn()
  })
}))
// FolderPicker is exercised elsewhere; stub it to a confirm button that hands back a folder.
jest.mock('@/ui/FolderPicker', () => {
  const { Button, Text } = require('react-native-paper')
  return {
    FolderPicker: ({ onConfirm, confirmLabel, title }: any) => (
      <>
        <Text>{title}</Text>
        <Button onPress={() => onConfirm({ _id: 'dest1', name: 'Docs' })}>{confirmLabel}</Button>
      </>
    )
  }
})

import ImportLayout from '../../app/import/_layout'
import { SnackbarHost, SnackbarOutlet } from '@/ui/SnackbarHost'
import { ImportScreen } from './ImportScreen'

// PaperProvider: ImportLayout renders a real react-native-paper Snackbar.
// SafeAreaProvider: Snackbar reads safe-area insets via useSafeAreaInsets,
// which throws without a provider ancestor (see AppBar.test.tsx).
const Harness = ({ open = true }: { open?: boolean }) => (
  <PaperProvider>
    <SafeAreaProvider>
      <SnackbarHost>
        <SnackbarOutlet />
        {open && (
          <ImportLayout>
            <ImportScreen pathSegments={[]} />
          </ImportLayout>
        )}
      </SnackbarHost>
    </SafeAreaProvider>
  </PaperProvider>
)
const wrap = () => render(<Harness />)

beforeAll(async () => {
  await i18n.changeLanguage('en')
})

beforeEach(() => {
  mockUploadBatch.mockReset()
  mockBack.mockClear()
  mockOnline = true
})

test('titles the picker with what it is for', () => {
  const { getByText } = wrap()
  expect(getByText('Import to…')).toBeTruthy()
})

test('confirming a destination uploads the pending items there', async () => {
  mockUploadBatch.mockResolvedValueOnce({ results: [], succeeded: 1, failed: 0 })
  const { getByText } = wrap()
  fireEvent.press(getByText('Import here'))
  await waitFor(() => expect(mockUploadBatch).toHaveBeenCalledTimes(1))
  const [, items, dirId] = mockUploadBatch.mock.calls[0]
  expect(items).toEqual([{ uri: 'file:///a.jpg', name: 'a.jpg', mimeType: 'image/jpeg' }])
  expect(dirId).toBe('dest1')
})

test('the import confirmation outlives the sheet it closes', async () => {
  mockUploadBatch.mockResolvedValueOnce({ results: [], succeeded: 1, failed: 0 })
  const { getByText, rerender } = wrap()
  fireEvent.press(getByText('Import here'))
  await waitFor(() => expect(mockBack).toHaveBeenCalledTimes(1))
  rerender(<Harness open={false} />)
  expect(getByText('File imported')).toBeTruthy()
})

test('offline, confirming says a connection is required and uploads nothing', async () => {
  mockOnline = false
  const { getByText, getByTestId, findByText } = wrap()
  fireEvent.press(getByText('Import here'))
  expect(await findByText('Connection required to import')).toBeTruthy()
  expect(getByTestId('offline-banner')).toBeTruthy()
  expect(mockUploadBatch).not.toHaveBeenCalled()
})
