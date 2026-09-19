import type CozyClient from 'cozy-client'

import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

export interface CreatedDrawing {
  _id: string
  name: string
}

interface CreateFileResultData {
  _id?: string
  id?: string
  attributes?: { name?: string }
}

interface FilesCollection {
  createFile: (
    data: ArrayBuffer,
    options: { name: string; dirId: string; contentType: string }
  ) => Promise<{ data: CreateFileResultData }>
}

export const EXCALIDRAW_MIME = 'application/vnd.excalidraw+json'

/** The scene twake-drive web writes for a new drawing (`makeEmptyScene`). */
export const emptyScene = (): string =>
  JSON.stringify({ type: 'excalidraw', version: 2, elements: [], appState: {}, files: {} })

export const buildDrawingName = (rawName: string): string => {
  const trimmed = rawName.trim() || 'Untitled'
  return trimmed.toLowerCase().endsWith('.excalidraw') ? trimmed : `${trimmed}.excalidraw`
}

/**
 * Creates an empty drawing through the API, the way the web app does, so the
 * file exists before any editor opens it.
 */
export const createExcalidrawFile = async (
  client: CozyClient,
  name: string,
  dirId: string
): Promise<CreatedDrawing> => {
  const finalName = buildDrawingName(name)
  const bytes = new TextEncoder().encode(emptyScene())
  const collection = client.collection('io.cozy.files') as unknown as FilesCollection
  const result = await collection.createFile(bytes.buffer as ArrayBuffer, {
    name: finalName,
    dirId,
    contentType: EXCALIDRAW_MIME
  })
  triggerPouchReplication(client, 'io.cozy.files')
  const data = result.data
  const id = data._id ?? data.id
  if (!id) throw new Error('Upload returned no id')
  return { _id: id, name: data.attributes?.name ?? finalName }
}
