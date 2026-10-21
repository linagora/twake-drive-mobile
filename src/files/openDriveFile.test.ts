jest.mock('cozy-flags', () => ({ __esModule: true, default: jest.fn() }))
const mockOpenFileNatively = jest.fn()
jest.mock('./openFile', () => ({
  openFileNatively: (...a: unknown[]) => mockOpenFileNatively(...a)
}))

import type CozyClient from 'cozy-client'
import flag from 'cozy-flags'
import type { Router } from 'expo-router'

import { openDriveFile } from './openDriveFile'

const mockFlag = flag as unknown as jest.Mock
const client = {} as CozyClient
const router = { push: jest.fn() } as unknown as Router
const openEditor = jest.fn().mockResolvedValue(undefined)

describe('openDriveFile', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockFlag.mockImplementation((name: string) =>
      name === 'drive.onlyoffice.enabled' ? true : null
    )
  })

  it('hands the Docs bridge the external id the document is addressed by', async () => {
    await openDriveFile(
      client,
      router,
      { _id: 'f1', name: 'Compte rendu.docs-note', metadata: { externalId: 'ext-9' } },
      { openEditor }
    )

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'f1', metadata: { externalId: 'ext-9' } }),
      undefined
    )
  })

  it('carries the external id into a shared drive too', async () => {
    await openDriveFile(
      client,
      router,
      { _id: 'f2', name: 'Note.docs-note', metadata: { externalId: 'ext-4' } },
      { openEditor, driveId: 'drive-1' }
    )

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ metadata: { externalId: 'ext-4' } }),
      'drive-1'
    )
  })

  it('still opens a document that has no metadata at all', async () => {
    await openDriveFile(client, router, { _id: 'f3', name: 'rapport.docx' }, { openEditor })

    expect(openEditor).toHaveBeenCalledWith(
      expect.objectContaining({ _id: 'f3', name: 'rapport.docx' }),
      undefined
    )
  })

  it('opens an office document on the device when OnlyOffice is off', async () => {
    mockFlag.mockReturnValue(null)

    await openDriveFile(client, router, { _id: 'f5', name: 'rapport.docx' }, { openEditor })

    expect(openEditor).not.toHaveBeenCalled()
    expect(mockOpenFileNatively).toHaveBeenCalledWith(
      client,
      expect.objectContaining({ _id: 'f5', name: 'rapport.docx' }),
      undefined
    )
  })

  it('closes the sheet it was opened from only once the web editor is dismissed', async () => {
    let dismissBrowser = (): void => undefined
    const pendingEditor = jest.fn(() => new Promise<void>(resolve => (dismissBrowser = resolve)))
    const closeSheet = jest.fn()

    const opening = openDriveFile(
      client,
      router,
      { _id: 'f6', name: 'croquis.excalidraw' },
      {
        openEditor: pendingEditor,
        closeSheet
      }
    )
    await Promise.resolve()
    expect(pendingEditor).toHaveBeenCalled()
    expect(closeSheet).not.toHaveBeenCalled()

    dismissBrowser()
    await opening
    expect(closeSheet).toHaveBeenCalled()
  })

  it('closes the sheet it was opened from before showing the preview', async () => {
    const closeSheet = jest.fn()

    await openDriveFile(
      client,
      router,
      { _id: 'f7', name: 'photo.jpg', mime: 'image/jpeg' },
      { openEditor, closeSheet }
    )

    expect(closeSheet.mock.invocationCallOrder[0]).toBeLessThan(
      (router.push as jest.Mock).mock.invocationCallOrder[0]
    )
  })

  it('previews a type no editor claims', async () => {
    await openDriveFile(
      client,
      router,
      { _id: 'f4', name: 'photo.jpg', mime: 'image/jpeg' },
      { openEditor }
    )

    expect(router.push).toHaveBeenCalledWith('/preview/f4')
  })
})
