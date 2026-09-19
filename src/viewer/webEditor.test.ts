import type CozyClient from 'cozy-client'

const mockFetchURL = jest.fn()
jest.mock('cozy-client', () => ({
  __esModule: true,
  models: { note: { fetchURL: (...args: unknown[]) => mockFetchURL(...args) } }
}))

const mockOpenBrowser = jest.fn()
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowser(...args)
}))

const mockRefresh = jest.fn()
jest.mock('@/files/refreshDocument', () => ({
  refreshDocumentFromStack: (...args: unknown[]) => mockRefresh(...args)
}))

import { openWebEditor, webEditorKindOf, webEditorUrl } from './webEditor'

const client = {
  getStackClient: () => ({ uri: 'https://mine.twake.test' })
} as unknown as CozyClient

const docx = {
  _id: 'f2',
  name: 'rapport.docx',
  mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
}

describe('webEditorKindOf', () => {
  it('recognises each type the web edits', () => {
    expect(webEditorKindOf({ _id: '1', name: 'a.cozy-note' })).toBe('note')
    expect(webEditorKindOf({ _id: '2', name: 'a.docs-note' })).toBe('docs')
    expect(webEditorKindOf(docx)).toBe('office')
    expect(webEditorKindOf({ _id: '4', name: 'schéma.excalidraw' })).toBe('excalidraw')
  })

  it('recognises an office document by its extension, before the stack typed it', () => {
    expect(webEditorKindOf({ _id: '5', name: 'rapport.xlsx' })).toBe('office')
  })

  it('claims nothing for a plain file', () => {
    expect(webEditorKindOf({ _id: '6', name: 'photo.jpg', mime: 'image/jpeg' })).toBeNull()
  })
})

describe('webEditorUrl', () => {
  beforeEach(() => jest.clearAllMocks())

  it('sends an office document to the drive app', async () => {
    await expect(webEditorUrl(client, docx)).resolves.toBe(
      'https://mine-drive.twake.test/#/onlyoffice/f2'
    )
  })

  it('names the drive a document belongs to, the way the web routes do', async () => {
    await expect(webEditorUrl(client, docx, 'drive-7')).resolves.toBe(
      'https://mine-drive.twake.test/#/onlyoffice/drive-7/f2'
    )
  })

  it('sends a drawing to the drive app too', async () => {
    await expect(webEditorUrl(client, { _id: 'f4', name: 'a.excalidraw' })).resolves.toBe(
      'https://mine-drive.twake.test/#/excalidraw/f4'
    )
  })

  it('opens a note of this instance in the notes app', async () => {
    await expect(webEditorUrl(client, { _id: 'note-1', name: 'a.cozy-note' })).resolves.toBe(
      'https://mine-notes.twake.test/#/n/note-1'
    )
    expect(mockFetchURL).not.toHaveBeenCalled()
  })

  it('asks the stack for a note of a shared drive, which answers with a sharecode', async () => {
    mockFetchURL.mockResolvedValue('https://owner-notes.twake.test/public/?sharecode=abc')

    await expect(
      webEditorUrl(client, { _id: 'note-1', name: 'a.cozy-note' }, 'drive-7')
    ).resolves.toBe('https://owner-notes.twake.test/public/?sharecode=abc')
    expect(mockFetchURL).toHaveBeenCalledWith(client, { id: 'note-1' }, { driveId: 'drive-7' })
  })

  it('sends a Docs document to its bridge', async () => {
    await expect(
      webEditorUrl(client, { _id: 'f3', name: 'a.docs-note', metadata: { externalId: 'ext-9' } })
    ).resolves.toBe('https://mine-docs.twake.test/#/bridge/docs/ext-9')
  })

  it('says so when a Docs document has no id on the Docs side', async () => {
    await expect(webEditorUrl(client, { _id: 'f3', name: 'a.docs-note' })).rejects.toThrow(
      'no Docs id'
    )
  })

  it('carries no credential: the browser holds the session', async () => {
    const url = await webEditorUrl(client, docx)
    expect(url).not.toContain('session_code')
  })
})

describe('openWebEditor', () => {
  beforeEach(() => jest.clearAllMocks())

  it('reads the document back once the browser is closed', async () => {
    await openWebEditor(client, docx, 'drive-7')

    expect(mockOpenBrowser).toHaveBeenCalledWith(
      'https://mine-drive.twake.test/#/onlyoffice/drive-7/f2'
    )
    expect(mockRefresh).toHaveBeenCalledWith(client, 'f2', 'drive-7')
  })
})
