import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { ErrorState } from '@/ui/ErrorState'
import { LoadingState } from '@/ui/LoadingState'
import { cozyTokens } from '@/ui/theme'
import { useIsOnline } from '@/network/useIsOnline'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile } from '@/files/fileTypes'
import { MarkdownView } from './markdown/MarkdownView'
import { OFFLINE_ERROR, readDocumentBytes } from './documentBytes'
import { readNoteContent } from './noteBlob'
import { hasWebEditor } from './documentKind'

export interface DocumentViewerFile {
  _id: string
  _rev?: string
  name: string
  mime?: string
}

interface Props {
  file: DocumentViewerFile
  /** Set when the document belongs to a shared drive, which serves its bytes. */
  driveId?: string
}

const toDataUri = (bytes: Uint8Array, name: string): string => {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  const extension = name.split('.').pop()?.toLowerCase() ?? 'png'
  const mime = extension === 'jpg' || extension === 'jpeg' ? 'image/jpeg' : `image/${extension}`
  return `data:${mime};base64,${global.btoa(binary)}`
}

const editorRoute = (file: DocumentViewerFile): string | null => {
  if (isCozyNoteFile(file.name)) return `/note/${file._id}`
  if (isDocsNoteFile(file.name)) return `/docs/${file._id}`
  if (isOfficeFile(file.mime)) return `/onlyoffice/${file._id}`
  return null
}

/**
 * Reads a document from the bytes the app already has, so a note or a Markdown
 * file opens without the stack — the web editor needs it, reading should not.
 *
 * Editing stays with the web editor, one tap away, and only with a network.
 */
export const DocumentViewer = ({ file, driveId }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const client = useClient()
  const router = useRouter()
  const isOnline = useIsOnline()
  const [markdown, setMarkdown] = useState<string | null>(null)
  const [images, setImages] = useState<Map<string, Uint8Array>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [reloadTick, setReloadTick] = useState(0)

  useEffect(() => {
    let cancelled = false
    const run = async (): Promise<void> => {
      if (!client) return
      setError(null)
      try {
        const bytes = await readDocumentBytes(client, file, driveId)
        const content = readNoteContent(bytes)
        if (cancelled) return
        setMarkdown(content.markdown)
        setImages(content.images)
      } catch (e) {
        console.error('[DocumentViewer] could not read the document', e)
        if (cancelled) return
        // Matched by name rather than by instance: the error crosses module
        // boundaries and an instanceof is not reliable there.
        setError(
          (e as Error)?.name === OFFLINE_ERROR
            ? t('drive.viewer.unavailableOffline')
            : t('drive.preview.loadFailed')
        )
      }
    }
    void run()
    return () => {
      cancelled = true
    }
  }, [client, driveId, file, reloadTick, t])

  const route = editorRoute(file)

  if (error) {
    return (
      <ErrorState
        message={error}
        onRetry={() => {
          setError(null)
          setReloadTick(tick => tick + 1)
        }}
      />
    )
  }

  if (markdown === null) return <LoadingState />

  return (
    <View style={styles.container}>
      <MarkdownView
        markdown={markdown}
        testID="document-viewer"
        resolveImage={src => {
          const image = images.get(src.replace(/^\.\//, ''))
          return image ? toDataUri(image, src) : undefined
        }}
      />
      {route && hasWebEditor(file) ? (
        <Button
          mode="contained-tonal"
          icon="pencil"
          testID="document-viewer-edit"
          style={styles.edit}
          disabled={!isOnline}
          onPress={() => router.push(route as Parameters<typeof router.push>[0])}
        >
          {t('drive.viewer.edit')}
        </Button>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  edit: {
    position: 'absolute',
    right: cozyTokens.spacing.md,
    bottom: cozyTokens.spacing.xl,
    zIndex: cozyTokens.zIndex.fab
  }
})
