let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

let mockNotesInstalled = true
jest.mock('@/client/useIsAppInstalled', () => ({
  useIsAppInstalled: () => mockNotesInstalled
}))

const mockOpenEditor = jest.fn()
jest.mock('./useWebEditor', () => ({ useWebEditor: () => mockOpenEditor }))

const client = { id: 'client' }
jest.mock('cozy-client', () => ({ __esModule: true, useClient: () => client }))

import React from 'react'
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { EditDocumentButton } from './EditDocumentButton'

const show = (file: { _id: string; name: string; mime?: string }, driveId?: string) =>
  render(
    <PaperProvider>
      <EditDocumentButton file={file} driveId={driveId} />
    </PaperProvider>
  )

const note = { _id: 'f1', name: 'réunion.cozy-note' }

describe('EditDocumentButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
    mockNotesInstalled = true
    mockOpenEditor.mockResolvedValue(undefined)
  })

  it('opens the document in its web editor', async () => {
    show(note)
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    await waitFor(() => expect(mockOpenEditor).toHaveBeenCalledWith(note, undefined))
  })

  it('carries the drive a document belongs to', async () => {
    show(note, 'drive-1')
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    await waitFor(() => expect(mockOpenEditor).toHaveBeenCalledWith(note, 'drive-1'))
  })

  it('stays on screen offline, out of reach rather than gone', () => {
    mockOnline = false
    show(note)
    expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockOpenEditor).not.toHaveBeenCalled()
  })

  it('renders nothing for a note when the Notes app is not installed', () => {
    mockNotesInstalled = false
    show(note)
    expect(screen.queryByTestId('document-viewer-edit')).toBeNull()
  })

  it('keeps the other editors when the Notes app is not installed', () => {
    mockNotesInstalled = false
    show({ _id: 'f6', name: 'schema.excalidraw' })
    expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen()
  })

  it('renders nothing for a document no editor claims', () => {
    show({ _id: 'f5', name: 'notes.md' })
    expect(screen.queryByTestId('document-viewer-edit')).toBeNull()
  })
})
