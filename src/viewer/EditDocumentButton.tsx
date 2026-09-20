import React, { useState } from 'react'
import { StyleProp, ViewStyle } from 'react-native'
import { Button } from 'react-native-paper'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { useIsOnline } from '@/network/useIsOnline'
import { hasWebEditor } from './documentKind'
import { EditableDocument, openWebEditor, webEditorKindOf } from './webEditor'

export type { EditableDocument } from './webEditor'
export { webEditorKindOf as editorKindFor } from './webEditor'

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
  const client = useClient()
  const isOnline = useIsOnline()
  const [opening, setOpening] = useState(false)

  if (!webEditorKindOf(file) || !hasWebEditor(file)) return null

  const onPress = async (): Promise<void> => {
    if (!client || opening) return
    setOpening(true)
    try {
      await openWebEditor(client, file, driveId)
    } catch (e) {
      console.error('[EditDocumentButton] could not open the editor', e)
    } finally {
      setOpening(false)
    }
  }

  return (
    <Button
      mode={mode}
      icon="pencil"
      testID="document-viewer-edit"
      style={style}
      loading={opening}
      // The editors are web ones: shown offline, but out of reach, rather than
      // disappearing and leaving the user wondering where editing went.
      disabled={!isOnline || !client}
      onPress={() => void onPress()}
    >
      {t('drive.viewer.edit')}
    </Button>
  )
}
