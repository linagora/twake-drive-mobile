const mockReadDocumentBytes = jest.fn()
const mockReadDocumentPathWithName = jest.fn()
jest.mock('./documentBytes', () => ({
  readDocumentBytes: (...a: unknown[]) => mockReadDocumentBytes(...a),
  readDocumentPathWithName: (...a: unknown[]) => mockReadDocumentPathWithName(...a),
  OFFLINE_ERROR: 'DocumentUnavailableOfflineError'
}))

const mockOpenInViewer = jest.fn()
jest.mock('@/files/openFile', () => ({
  openInViewer: (...a: unknown[]) => mockOpenInViewer(...a)
}))

const offlineError = (): Error => {
  const error = new Error('offline')
  error.name = 'DocumentUnavailableOfflineError'
  return error
}

const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))
jest.mock('cozy-client', () => ({ useClient: () => ({}) }))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

import React from 'react'
import { render, screen, waitFor, fireEvent } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { DocumentViewer } from './DocumentViewer'

const encoder = new TextEncoder()

const show = (file: { _id: string; name: string; mime?: string }, driveId?: string) =>
  render(
    <PaperProvider>
      <DocumentViewer file={file} driveId={driveId} />
    </PaperProvider>
  )

describe('DocumentViewer', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
  })

  it('renders the document it just read', async () => {
    mockReadDocumentBytes.mockResolvedValue(encoder.encode('# Titre\n\ncorps'))
    show({ _id: 'f1', name: 'note.cozy-note' })
    await waitFor(() => expect(screen.getByText('Titre')).toBeOnTheScreen())
    expect(screen.getByText('corps')).toBeOnTheScreen()
  })

  it('reads a document of a shared drive through that drive', async () => {
    mockReadDocumentBytes.mockResolvedValue(encoder.encode('corps'))
    show({ _id: 'f1', name: 'note.cozy-note' }, 'drive-1')
    await waitFor(() => expect(mockReadDocumentBytes).toHaveBeenCalled())
    expect(mockReadDocumentBytes.mock.calls[0][2]).toBe('drive-1')
  })

  it('says a document is not available offline rather than fail silently', async () => {
    mockReadDocumentBytes.mockRejectedValue(offlineError())
    show({ _id: 'f1', name: 'note.cozy-note' })
    await waitFor(() =>
      expect(screen.getByText('drive.viewer.unavailableOffline')).toBeOnTheScreen()
    )
  })

  it('offers the web editor for a note', async () => {
    mockReadDocumentBytes.mockResolvedValue(encoder.encode('corps'))
    show({ _id: 'f1', name: 'note.cozy-note' })
    await waitFor(() => expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockPush).toHaveBeenCalledWith('/note/f1')
  })

  it('does not offer to edit a plain markdown file, which has no editor', async () => {
    mockReadDocumentBytes.mockResolvedValue(encoder.encode('corps'))
    show({ _id: 'f2', name: 'notes.md' })
    await waitFor(() => expect(screen.getByText('corps')).toBeOnTheScreen())
    expect(screen.queryByTestId('document-viewer-edit')).toBeNull()
  })

  it('hands an office document to the OS viewer, from the local copy', async () => {
    mockReadDocumentPathWithName.mockResolvedValue('file:///cache/open/f3-rapport.docx')
    show({
      _id: 'f3',
      name: 'rapport.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    await waitFor(() =>
      expect(mockOpenInViewer).toHaveBeenCalledWith('file:///cache/open/f3-rapport.docx')
    )
    expect(mockReadDocumentBytes).not.toHaveBeenCalled()
    expect(screen.getByTestId('document-viewer-open-again')).toBeOnTheScreen()
  })

  it('offers the office editor once the document is open', async () => {
    mockReadDocumentPathWithName.mockResolvedValue('file:///cache/open/f3-rapport.docx')
    show({
      _id: 'f3',
      name: 'rapport.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    })
    await waitFor(() => expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockPush).toHaveBeenCalledWith('/onlyoffice/f3')
  })

  it('leaves the edit button out of reach offline', async () => {
    mockOnline = false
    mockReadDocumentBytes.mockResolvedValue(encoder.encode('corps'))
    show({ _id: 'f1', name: 'note.cozy-note' })
    await waitFor(() => expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen())
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockPush).not.toHaveBeenCalled()
  })
})
