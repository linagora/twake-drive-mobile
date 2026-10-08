import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k })
}))

const mockClient = { getStackClient: () => ({ uri: 'https://alice.mycozy.cloud' }) }
jest.mock('cozy-client', () => ({
  __esModule: true,
  useClient: () => mockClient
}))

const mockFlags: Record<string, boolean> = {}
jest.mock('@/client/useFlag', () => ({
  useFlag: (name: string) => mockFlags[name] ?? false
}))

let mockOnline = true
let mockNotesInstalled = true
jest.mock('@/client/useIsAppInstalled', () => ({
  useIsAppInstalled: (slug: string) => slug === 'notes' && mockNotesInstalled
}))
jest.mock('@/network/useIsOnline', () => ({
  useIsOnline: () => mockOnline
}))

jest.mock('@/viewer/useWebEditor', () => ({
  useWebEditor: () => jest.fn()
}))

jest.mock('@/files/createFolder', () => ({ createFolder: jest.fn() }))
jest.mock('@/files/createCozyNote', () => ({ createCozyNote: jest.fn() }))
jest.mock('@/files/createOfficeFile', () => ({ createOfficeFile: jest.fn() }))
jest.mock('@/files/createExcalidrawFile', () => ({ createExcalidrawFile: jest.fn() }))
jest.mock('@/files/createShortcut', () => ({ createShortcut: jest.fn() }))

jest.mock('@/files/optimisticFiles', () => ({ optimisticFiles: jest.fn() }))
jest.mock('@/files/optimisticCreated', () => ({ optimisticCreated: (doc: unknown) => doc }))
jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

jest.mock('./pickDocuments', () => ({ pickDocuments: jest.fn().mockResolvedValue([]) }))
jest.mock('@/share/uploadBatch', () => ({ uploadBatch: jest.fn() }))

import { CreateMenu } from './CreateMenu'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

const openFab = (): void => {
  fireEvent.press(screen.getByTestId('drive-fab'))
}

beforeEach(() => {
  mockOnline = true
  mockNotesInstalled = true
  for (const key of Object.keys(mockFlags)) delete mockFlags[key]
})

describe('CreateMenu', () => {
  it('renders nothing when the member may not write here', () => {
    render(wrap(<CreateMenu dirId="d1" canWrite={false} notify={jest.fn()} />))
    expect(screen.queryByTestId('drive-fab')).toBeNull()
  })

  it('renders the FAB when the member may write', () => {
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    expect(screen.getByTestId('drive-fab')).toBeOnTheScreen()
  })

  it('offers the note entry when the Notes app is installed', () => {
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.note')).toBeOnTheScreen()
  })

  it('hides the note entry when the Notes app is not installed', () => {
    mockNotesInstalled = false
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.note')).toBeNull()
    expect(screen.queryByLabelText('drive.createMenu.folder')).toBeOnTheScreen()
  })

  it('offers the shortcut entry outside a shared drive', () => {
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.shortcut')).toBeOnTheScreen()
  })

  it('hides the shortcut entry inside a shared drive, which the stack refuses', () => {
    render(wrap(<CreateMenu dirId="d1" driveId="drive-1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.shortcut')).toBeNull()
  })

  it('offers the upload entry outside a shared drive', () => {
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.upload')).toBeOnTheScreen()
  })

  it('hides the upload entry inside a shared drive', () => {
    render(wrap(<CreateMenu dirId="d1" driveId="drive-1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.upload')).toBeNull()
  })

  it('opens the document picker when the upload entry is pressed', () => {
    const { pickDocuments } = jest.requireMock('./pickDocuments') as {
      pickDocuments: jest.Mock
    }
    render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
    openFab()
    fireEvent.press(screen.getByTestId('create-upload', { hidden: true }))
    expect(pickDocuments).toHaveBeenCalled()
  })

  it('hides the docs entry inside a shared drive', () => {
    mockFlags['drive.lasuitedocs.enabled'] = true
    render(wrap(<CreateMenu dirId="d1" driveId="drive-1" canWrite notify={jest.fn()} />))
    openFab()
    expect(screen.queryByLabelText('drive.createMenu.docs')).toBeNull()
  })

  describe('office entries', () => {
    const open = (): void => {
      render(wrap(<CreateMenu dirId="d1" canWrite notify={jest.fn()} />))
      openFab()
    }

    it('hides them on an instance without the office flags', () => {
      open()
      expect(screen.queryByLabelText('drive.createMenu.text')).toBeNull()
      expect(screen.queryByLabelText('drive.createMenu.sheet')).toBeNull()
      expect(screen.queryByLabelText('drive.createMenu.slide')).toBeNull()
    })

    it('offers them when office is on and writable', () => {
      mockFlags['drive.office.touchScreen.enabled'] = true
      mockFlags['drive.office.write'] = true
      open()
      expect(screen.queryByLabelText('drive.createMenu.text')).toBeOnTheScreen()
      expect(screen.queryByLabelText('drive.createMenu.sheet')).toBeOnTheScreen()
      expect(screen.queryByLabelText('drive.createMenu.slide')).toBeOnTheScreen()
    })

    it('hides them on a read-only touch screen', () => {
      mockFlags['drive.office.touchScreen.enabled'] = true
      mockFlags['drive.office.write'] = true
      mockFlags['drive.office.touchScreen.readOnly'] = true
      open()
      expect(screen.queryByLabelText('drive.createMenu.text')).toBeNull()
    })
  })
})
