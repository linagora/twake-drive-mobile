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
let mockContacts: unknown[] = []
jest.mock('@/files/useReachableContacts', () => ({
  useReachableContacts: () => ({ contacts: mockContacts, loading: false })
}))
const mockCreateSharing = jest.fn()
const mockAddRecipients = jest.fn()
const mockRevokeMember = jest.fn()
jest.mock('@/files/sharing', () => ({
  ...jest.requireActual('@/files/sharing'),
  createSharingForFile: (...args: unknown[]) => mockCreateSharing(...args),
  addRecipients: (...args: unknown[]) => mockAddRecipients(...args),
  revokeSharingMember: (...args: unknown[]) => mockRevokeMember(...args)
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
    mockContacts = []
    mockCreateSharing.mockReset().mockResolvedValue({ _id: 'new' })
    mockAddRecipients.mockReset().mockResolvedValue(undefined)
    mockRevokeMember.mockReset().mockResolvedValue(undefined)
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

  describe('recipient chips', () => {
    const openForm = async () => {
      render(wrap(<ShareRoute />))
      fireEvent.press(await screen.findByTestId('share-add-recipient'))
      return screen.getByTestId('share-email-input')
    }

    it('turns a finished address into a chip and frees the field', async () => {
      const input = await openForm()
      fireEvent.changeText(input, 'ada@example.org,')
      expect(screen.getByText('ada@example.org')).toBeOnTheScreen()
      expect(screen.getByTestId('share-email-input').props.value).toBe('')
      fireEvent.changeText(screen.getByTestId('share-email-input'), 'bob@example.org,')
      expect(screen.getAllByTestId('recipient-chip')).toHaveLength(2)
    })

    it('offers the autocomplete again after a first chip', async () => {
      mockContacts = [
        { _id: 'c1', fullname: 'Ada', email: [{ address: 'ada@example.org', primary: true }] },
        { _id: 'c2', fullname: 'Bob', email: [{ address: 'bob@example.org', primary: true }] }
      ]
      const input = await openForm()
      fireEvent.press(screen.getByLabelText('Ada ada@example.org'))
      expect(screen.getAllByTestId('recipient-chip')).toHaveLength(1)
      fireEvent.changeText(input, 'bo')
      fireEvent.press(screen.getByLabelText('Bob bob@example.org'))
      expect(screen.getAllByTestId('recipient-chip')).toHaveLength(2)
      expect(screen.queryByLabelText('Ada ada@example.org')).toBeNull()
    })

    it('refuses a chip with the owner address', async () => {
      mockContacts = [
        { _id: 'me', me: true, email: [{ address: 'Owner@Example.org', primary: true }] }
      ]
      const input = await openForm()
      fireEvent.changeText(input, 'owner@example.org,')
      expect(screen.queryByTestId('recipient-chip')).toBeNull()
      expect(screen.getByText('drive.share.errorSelf')).toBeOnTheScreen()
    })

    it('removes a chip', async () => {
      const input = await openForm()
      fireEvent.changeText(input, 'ada@example.org,')
      fireEvent.press(screen.getByLabelText('a11y.removeChip'))
      expect(screen.queryByTestId('recipient-chip')).toBeNull()
    })

    it('refuses text that is not an address', async () => {
      const input = await openForm()
      fireEvent.changeText(input, 'nobody')
      fireEvent.press(screen.getByTestId('share-send'))
      expect(await screen.findByText('drive.share.invalidEmail')).toBeOnTheScreen()
      expect(mockCreateSharing).not.toHaveBeenCalled()
    })

    it('shares with every chip and the typed rest at once, as viewers by default', async () => {
      const input = await openForm()
      fireEvent.changeText(input, 'ada@example.org,')
      fireEvent.changeText(screen.getByTestId('share-email-input'), 'bob@example.org')
      fireEvent.press(screen.getByTestId('share-send'))
      await waitFor(() => expect(mockCreateSharing).toHaveBeenCalledTimes(1))
      expect(mockCreateSharing).toHaveBeenCalledWith(
        mockClient,
        expect.objectContaining({ _id: 'f1' }),
        [
          { email: 'ada@example.org', contactId: undefined },
          { email: 'bob@example.org', contactId: undefined }
        ],
        true,
        { sharedDrive: true }
      )
    })
  })
})
