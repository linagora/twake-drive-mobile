import React from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { Button } from 'react-native-paper'
import { useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { useIsOnline } from '@/network/useIsOnline'
import { isCozyNoteFile, isDocsNoteFile, isOfficeFile } from '@/files/fileTypes'
import { hasWebEditor } from './documentKind'

export interface EditableDocument {
  _id: string
  name: string
  mime?: string
}

/**
 * The editor a document opens in when the user asks to change it.
 *
 * Every type is edited in its own web editor; the app only reads. One place to
 * change if that ever moves.
 */
export const editorRouteFor = (file: EditableDocument, driveId?: string): string | null => {
  const scope = driveId ? `?driveId=${encodeURIComponent(driveId)}` : ''
  if (isCozyNoteFile(file.name)) return `/note/${file._id}${scope}`
  if (isDocsNoteFile(file.name)) return `/docs/${file._id}${scope}`
  if (isOfficeFile(file.mime)) return `/onlyoffice/${file._id}${scope}`
  if (/\.excalidraw$/i.test(file.name)) return `/excalidraw/${file._id}${scope}`
  return null
}

interface Props {
  file: EditableDocument
  /** Set when the document belongs to a shared drive, whose editor it is. */
  driveId?: string
  mode?: 'text' | 'contained-tonal'
  style?: StyleProp<ViewStyle>
}

/**
 * The Edit button of every viewer.
 *
 * It was written out once per document type, with the rules drifting between
 * the copies — one hid itself offline where the others disabled themselves.
 * Anything about editing from a viewer belongs here now.
 */
export const EditDocumentButton = ({
  file,
  driveId,
  mode = 'contained-tonal',
  style
}: Props): React.ReactElement | null => {
  const { t } = useTranslation()
  const router = useRouter()
  const isOnline = useIsOnline()

  const route = editorRouteFor(file, driveId)
  if (!route || !hasWebEditor(file)) return null

  return (
    <Button
      mode={mode}
      icon="pencil"
      testID="document-viewer-edit"
      style={style}
      // The editors are web ones: shown offline, but out of reach, rather than
      // disappearing and leaving the user wondering where editing went.
      disabled={!isOnline}
      onPress={() => router.push(route as Parameters<typeof router.push>[0])}
    >
      {t('drive.viewer.edit')}
    </Button>
  )
}
