let mockOnline = true
jest.mock('@/network/useIsOnline', () => ({ useIsOnline: () => mockOnline }))

const mockOpenWebEditor = jest.fn()
jest.mock('./webEditor', () => {
  const actual = jest.requireActual('./webEditor')
  return {
    ...actual,
    openWebEditor: (...args: unknown[]) => mockOpenWebEditor(...args)
  }
})

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
    mockOpenWebEditor.mockResolvedValue(undefined)
  })

  it('opens the document in its web editor', async () => {
    show(note)
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    await waitFor(() => expect(mockOpenWebEditor).toHaveBeenCalledWith(client, note, undefined))
  })

  it('carries the drive a document belongs to', async () => {
    show(note, 'drive-1')
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    await waitFor(() => expect(mockOpenWebEditor).toHaveBeenCalledWith(client, note, 'drive-1'))
  })

  it('stays on screen offline, out of reach rather than gone', () => {
    mockOnline = false
    show(note)
    expect(screen.getByTestId('document-viewer-edit')).toBeOnTheScreen()
    fireEvent.press(screen.getByTestId('document-viewer-edit'))
    expect(mockOpenWebEditor).not.toHaveBeenCalled()
  })

  it('renders nothing for a document no editor claims', () => {
    show({ _id: 'f5', name: 'notes.md' })
    expect(screen.queryByTestId('document-viewer-edit')).toBeNull()
  })
})
