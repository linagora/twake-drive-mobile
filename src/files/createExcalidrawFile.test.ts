import type CozyClient from 'cozy-client'

jest.mock('@/pouchdb/triggerReplication', () => ({ triggerPouchReplication: jest.fn() }))

import { buildDrawingName, createExcalidrawFile, emptyScene } from './createExcalidrawFile'

const clientWith = (createFile: jest.Mock) =>
  ({ collection: () => ({ createFile }) }) as unknown as CozyClient

describe('createExcalidrawFile', () => {
  it('names the file after the drawing, with the extension the web uses', () => {
    expect(buildDrawingName('Schéma')).toBe('Schéma.excalidraw')
    expect(buildDrawingName('Schéma.excalidraw')).toBe('Schéma.excalidraw')
    expect(buildDrawingName('   ')).toBe('Untitled.excalidraw')
  })

  it('writes the empty scene the web app writes', () => {
    expect(JSON.parse(emptyScene())).toEqual({
      type: 'excalidraw',
      version: 2,
      elements: [],
      appState: {},
      files: {}
    })
  })

  it('uploads the scene into the folder and returns the new file', async () => {
    const createFile = jest.fn().mockResolvedValue({ data: { _id: 'f1' } })

    const created = await createExcalidrawFile(clientWith(createFile), 'Schéma', 'dir-1')

    expect(created).toEqual({ _id: 'f1', name: 'Schéma.excalidraw' })
    const [bytes, options] = createFile.mock.calls[0]
    expect(new TextDecoder().decode(bytes as ArrayBuffer)).toBe(emptyScene())
    expect(options).toEqual({
      name: 'Schéma.excalidraw',
      dirId: 'dir-1',
      contentType: 'application/vnd.excalidraw+json'
    })
  })

  it('fails loudly when the upload answers without an id', async () => {
    const createFile = jest.fn().mockResolvedValue({ data: {} })
    await expect(createExcalidrawFile(clientWith(createFile), 'x', 'dir-1')).rejects.toThrow(
      'Upload returned no id'
    )
  })
})
