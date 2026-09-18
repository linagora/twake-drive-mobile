import ReactNativeBlobUtil from 'react-native-blob-util'
import type CozyClient from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { writeDocumentCache } from './documentBytes'
import { forgetEdit, PendingEdit, pendingEdits, rememberEdit } from './pendingEdits'

export type SaveOutcome = 'saved' | 'queued'

export interface SavableFile {
  _id: string
  _rev?: string
  name: string
  mime?: string
}

interface MinimalStackClient {
  uri: string
  getAccessToken: () => string | null | undefined
}

interface UploadResponse {
  info: () => { status: number }
}

// react-native-blob-util streams from a real filesystem path (no file://).
const toLocalPath = (uri: string): string =>
  uri.startsWith('file://') ? decodeURIComponent(uri.slice('file://'.length)) : uri

const uploadUrl = (stackUri: string, fileId: string, driveId?: string): string =>
  driveId
    ? `${stackUri}/sharings/drives/${encodeURIComponent(driveId)}/${encodeURIComponent(fileId)}`
    : `${stackUri}/files/${encodeURIComponent(fileId)}`

const putContent = async (
  client: CozyClient,
  file: SavableFile,
  path: string,
  driveId?: string
): Promise<void> => {
  const stack = client.getStackClient() as unknown as MinimalStackClient
  const token = stack.getAccessToken()
  if (!token) throw new Error('No access token available')

  const response = (await ReactNativeBlobUtil.fetch(
    'PUT',
    uploadUrl(stack.uri, file._id, driveId),
    {
      Authorization: `Bearer ${token}`,
      'Content-Type': file.mime || 'application/json'
    },
    ReactNativeBlobUtil.wrap(toLocalPath(path))
  )) as unknown as UploadResponse

  const status = response.info().status
  if (status >= 400) throw new Error(`Save failed (HTTP ${status})`)
}

/**
 * Keeps an edit: on disk first, then on the instance.
 *
 * The local copy is written whatever happens, so the document shows what the
 * user drew even with no network and after a restart. When the instance cannot
 * be reached, the edit is remembered and sent by `flushPendingEdits` later.
 */
export const saveDocument = async (
  client: CozyClient,
  file: SavableFile,
  content: string,
  driveId?: string
): Promise<SaveOutcome> => {
  const path = await writeDocumentCache(file, content)
  const edit: PendingEdit = {
    fileId: file._id,
    name: file.name,
    driveId,
    mime: file.mime,
    path,
    editedAt: Date.now()
  }

  if (!getOnlineMonitor().getCurrent()) {
    rememberEdit(edit)
    return 'queued'
  }

  try {
    await putContent(client, file, path, driveId)
    forgetEdit(file._id)
    return 'saved'
  } catch (e) {
    console.warn('[saveDocument] could not save now, keeping the edit', e)
    rememberEdit(edit)
    return 'queued'
  }
}

/** Sends the edits made with no network, once there is one again. */
export const flushPendingEdits = async (client: CozyClient): Promise<number> => {
  if (!getOnlineMonitor().getCurrent()) return 0
  let sent = 0
  for (const edit of pendingEdits()) {
    try {
      await putContent(
        client,
        { _id: edit.fileId, name: edit.name, mime: edit.mime },
        edit.path,
        edit.driveId
      )
      forgetEdit(edit.fileId)
      sent += 1
    } catch (e) {
      console.warn('[saveDocument] an edit could not be sent yet', edit.fileId, e)
    }
  }
  return sent
}
