import { useMemo } from 'react'
import * as WebBrowser from 'expo-web-browser'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'
import Minilog from 'cozy-minilog'

import { CreatableFileClass } from '@/ui/CreateOfficeFileDialog'
import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { useWebEditor } from '@/viewer/useWebEditor'
import { createFolder } from '@/files/createFolder'
import { createCozyNote } from '@/files/createCozyNote'
import { createOfficeFile } from '@/files/createOfficeFile'
import { createShortcut } from '@/files/createShortcut'
import { createExcalidrawFile } from '@/files/createExcalidrawFile'
import { buildCozyAppUrl } from '@/files/cozyAppLink'
import { optimisticFiles } from '@/files/optimisticFiles'
import { optimisticCreated } from '@/files/optimisticCreated'
import { uploadBatch } from '@/share/uploadBatch'
import { batchMessage, optimisticUploaded } from '@/share/importFeedback'
import { pickDocuments } from './pickDocuments'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'

const log = Minilog('useCreateHandlers')

export interface CreateHandlersDeps {
  dirId: string
  /** Set when the directory is served by `/sharings/drives/<id>`. */
  driveId?: string
  notify: (message: string) => void
  /** Screens holding their listing in local state refresh it from here. */
  onCreated?: (created?: CreatedEntry) => void
}

export interface CreatedEntry {
  _id: string
  name: string
  type: 'directory' | 'file'
}

export interface CreateHandlers {
  createFolderNamed: (name: string) => Promise<void>
  createNote: () => Promise<void>
  createDocs: () => Promise<void>
  createOfficeNamed: (fileClass: CreatableFileClass, name: string) => Promise<void>
  createShortcutNamed: (name: string, url: string) => Promise<void>
  uploadFiles: () => Promise<void>
}

export const useCreateHandlers = ({
  dirId,
  driveId,
  notify,
  onCreated
}: CreateHandlersDeps): CreateHandlers => {
  const { t } = useTranslation()
  const client = useClient()
  const isOnline = useIsOnline()
  const openEditor = useWebEditor()

  return useMemo(() => {
    // A drive-scoped create lands on the owner's instance: our store holds
    // nothing of that drive, so an optimistic row would never reconcile.
    // The create succeeded on the stack by the time this runs: whatever the
    // local store or the screen callback does must not turn it into a failure.
    const afterCreate = (created: { _id: string; name?: string }, type: 'directory' | 'file') => {
      try {
        if (!driveId && client) {
          optimisticFiles(client, [
            optimisticCreated({ ...created, name: created.name ?? '' }, dirId, type)
          ])
        }
        onCreated?.({ _id: created._id, name: created.name ?? '', type })
      } catch (e) {
        log.warn('created, local update failed', e)
      }
    }

    return {
      createFolderNamed: async (name: string) => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) throw new Error('No client')
        afterCreate(await createFolder(client, name, dirId, driveId), 'directory')
      },

      createNote: async () => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) return
        try {
          const created = await createCozyNote(client, dirId, driveId)
          afterCreate(created, 'file')
          await openEditor({ _id: created._id, name: created.name ?? '' })
        } catch (e) {
          console.error('[CreateMenu] note creation failed', e)
          notify(t('errors.generic'))
        }
      },

      createDocs: async () => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) return
        try {
          const stackUri = client.getStackClient().uri as string
          // Docs documents are created by the Docs frontend on its own
          // backend, which a Drive token cannot reach; its bridge route owns
          // the creation.
          const url = buildCozyAppUrl(stackUri, 'docs', `/bridge/docs/new/${dirId}`)
          await WebBrowser.openBrowserAsync(url)
          triggerPouchReplication(client, 'io.cozy.files')
          onCreated?.()
        } catch (e) {
          console.error('[CreateMenu] docs creation failed', e)
          notify(t('errors.generic'))
        }
      },

      createOfficeNamed: async (fileClass: CreatableFileClass, name: string) => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) throw new Error('No client')
        const created =
          fileClass === 'excalidraw'
            ? await createExcalidrawFile(client, name, dirId, driveId)
            : await createOfficeFile(client, fileClass, name, dirId, driveId)
        afterCreate(created, 'file')
        if (fileClass === 'excalidraw') return
        void openEditor({ _id: created._id, name: created.name })
      },

      createShortcutNamed: async (name: string, url: string) => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) throw new Error('No client')
        afterCreate(await createShortcut(client, dirId, name, url), 'file')
      },

      uploadFiles: async () => {
        if (!requireOnline(isOnline, notify, t)) return
        if (!client) return
        try {
          const items = await pickDocuments()
          if (items.length === 0) return
          // A name already taken in the folder is renamed "name (1)" by the
          // upload, as the web upload queue does, rather than overwritten.
          const res = await uploadBatch(
            client,
            items,
            dirId,
            (done, total) =>
              notify(t('drive.import.uploading', { done: Math.min(done + 1, total), total })),
            driveId
          )
          notify(batchMessage(t, res))
          // As for the other creates, our store holds nothing of a shared
          // drive: its screen shows the uploaded rows from onCreated instead.
          const uploaded = res.results.flatMap(r => (r.file ? [r.file] : []))
          if (driveId && uploaded.length > 0) {
            for (const file of uploaded) afterCreate(file, 'file')
            return
          }
          if (!driveId) optimisticUploaded(client, res, dirId)
          onCreated?.()
        } catch (e) {
          console.error('[CreateMenu] upload failed', e)
          notify(t('drive.import.errorGeneric'))
        }
      }
    }
  }, [client, dirId, driveId, isOnline, notify, onCreated, openEditor, t])
}
