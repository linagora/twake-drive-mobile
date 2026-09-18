const mockPush = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ push: mockPush }) }))

let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { PaperProvider } from 'react-native-paper'

import { EditDocumentButton, editorRouteFor } from './EditDocumentButton'

const show = (file: { _id: string; name: string; mime?: string }, driveId?: string) =>
  render(
    <PaperProvider>
      <EditDocumentButton file={file} driveId={driveId} />
    </PaperProvider>
  )

const note = { _id: 'f1', name: 'réunion.cozy-note' }
const docx = {
  _id: 'f2',
  name: 'rapport.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

describe('editorRouteFor', () => {
  it('sends each type to its own editor', () => {
    expect(editorRouteFor(note)).toBe('/note/f1')
    expect(editorRouteFor({ _id: 'f3', name: 'a.docs-note' })).toBe('/docs/f3')
    expect(editorRouteFor(docx)).toBe('/onlyoffice/f2')
    expect(editorRouteFor({ _id: 'f4', name: 'schéma.excalidraw' })).toBe('/excalidraw/f4')
  })

  it('carries the drive a document belongs to', () => {
    expect(editorRouteFor(note, 'drive-1')).toBe('/note/f1?driveId=drive-1')
  })

  it('has no editor to offer for a plain file', () => {
    expect(editorRouteFor({ _id: 'f5', name: 'photo.jpg', mime: 'image/jpeg' })).toBeNull()
  })
})

describe('EditDocumentButton', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockOnline = true
  })

  it('opens the editor of the document', () => {
    show(note)
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockPush).toHaveBeenCalledWith('/note/f1')
  })

  it('stays on screen offline, out of reach rather than gone', () => {
    mockOnline = false
    show(note)
    expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockPush).not.toHaveBeenCalled()
  })

  it('renders nothing for a document no editor claims', () => {
    show({ _id: 'f5', name: 'notes.md' })
    expect(screen.queryByTestId('document-viewer-edit')).toBeNull()
  })
})
