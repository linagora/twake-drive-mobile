import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'

let mockParams: { fileId: string; driveId?: string } = { fileId: 'f1' }
jest.mock('expo-router', () => ({
  __esModule: true,
  useRouter: () => ({ back: jest.fn(), canGoBack: () => true }),
  useLocalSearchParams: () => mockParams
}))

const mockClient = { getStackClient: () => ({ uri: 'https://example.localhost' }) }
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockClient,
  // Keyed on the query name so a re-render answers the same thing: the file for
  // fileByIdQuery, an empty list for anything else (reachable contacts).
  useQuery: jest.fn().mockImplementation((_def: unknown, options: { as?: string }) => {
    if (options?.as?.startsWith('io.cozy.files/f1')) {
      return {
        data: { _id: 'f1', name: 'rapport.pdf', type: 'file' },
        fetchStatus: 'loaded'
      }
    }
    return { data: [], fetchStatus: 'loaded' }
  }),
  Q: () => ({
    getById: () => ({}),
    where: () => ({ partialIndex: () => ({ indexFields: () => ({ limitBy: () => ({}) }) }) })
  })
}))

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key })
}))

jest.mock('@/client/useFlag', () => ({ useFlag: () => true }))
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => true }))
jest.mock('@/files/useReachableContacts', () => ({
  useReachableContacts: () => ({ contacts: [], loading: false })
}))
const mockFetchEffectiveRecipients = jest.fn()
jest.mock('@/files/effectiveRecipients', () => ({
  fetchEffectiveRecipients: (...args: unknown[]) => mockFetchEffectiveRecipients(...args)
}))
jest.mock('@/sharing/SharingProvider', () => ({
  useFileSharing: () => ({ loaded: true, entry: undefined }),
  useRefreshSharings: () => jest.fn()
}))
jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }))

import ShareRoute from './[fileId]'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('ShareRoute', () => {
  beforeEach(() => {
    mockParams = { fileId: 'f1' }
    mockFetchEffectiveRecipients.mockReset()
    mockFetchEffectiveRecipients.mockResolvedValue([])
  })

  it('renders the file name', async () => {
    render(wrap(<ShareRoute />))
    expect(await screen.findByText('rapport.pdf')).toBeOnTheScreen()
  })

  it('lists the recipients the document effectively has', async () => {
    mockFetchEffectiveRecipients.mockResolvedValue([
      {
        key: 'own-1',
        name: 'Ada',
        email: 'ada@example.org',
        status: 'ready',
        readOnly: false,
        sharingId: 'own',
        memberIndex: 1,
        manageable: true
      }
    ])
    render(wrap(<ShareRoute />))
    expect(await screen.findByText('Ada')).toBeOnTheScreen()
    expect(screen.getByTestId('recipient-row')).toBeOnTheScreen()
    expect(mockFetchEffectiveRecipients).toHaveBeenCalledWith(mockClient, 'f1', undefined)
  })

  it('asks the drive route for a document inside a shared drive', async () => {
    mockParams = { fileId: 'f1', driveId: 'drive-1' }
    render(wrap(<ShareRoute />))
    await waitFor(() =>
      expect(mockFetchEffectiveRecipients).toHaveBeenCalledWith(mockClient, 'f1', 'drive-1')
    )
  })

  it('exposes the handles the e2e share flow drives', async () => {
    render(wrap(<ShareRoute />))
    const addButton = await screen.findByTestId('share-add-recipient')
    fireEvent.press(addButton)
    expect(screen.getByTestId('share-email-input')).toBeOnTheScreen()
    expect(screen.getByTestId('share-send')).toBeOnTheScreen()
  })

  it('offers no revocation on an access it cannot manage here', async () => {
    mockFetchEffectiveRecipients.mockResolvedValue([
      {
        key: 'parent-2',
        name: 'Ada',
        status: 'ready',
        readOnly: false,
        sharingId: 'parent',
        memberIndex: 2,
        manageable: false,
        inheritedFrom: 'Reports'
      }
    ])
    render(wrap(<ShareRoute />))
    expect(await screen.findByText('drive.share.inheritedFrom')).toBeOnTheScreen()
    expect(screen.queryByTestId('remove-recipient')).toBeNull()
  })
})
