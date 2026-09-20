import React, { useState, useEffect } from 'react'
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { useKeyboardOffset } from './useKeyboardOffset'

import type { OfficeFileClass } from '@/files/createOfficeFile'

/** What the dialog can name: an office document, or a drawing. */
export type CreatableFileClass = OfficeFileClass | 'excalidraw'

interface Props {
  visible: boolean
  fileClass: CreatableFileClass | null
  onDismiss: () => void
  onSubmit: (name: string) => Promise<void>
}

const CLASS_LABEL_KEY: Record<CreatableFileClass, string> = {
  text: 'drive.createMenu.text',
  sheet: 'drive.createMenu.sheet',
  slide: 'drive.createMenu.slide',
  excalidraw: 'drive.createMenu.excalidraw'
}

export const CreateOfficeFileDialog = ({ visible, fileClass, onDismiss, onSubmit }: Props) => {
  const { t } = useTranslation()
  const [name, setName] = useState('')
  const keyboardHeight = useKeyboardOffset(visible)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (visible) {
      setName('')
      setError(null)
      setSubmitting(false)
    }
  }, [visible])

  const handleSubmit = async () => {
    if (!name.trim() || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(name.trim())
    } catch {
      setError(t('drive.createOffice.errorGeneric'))
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  const subtitle = fileClass ? t(CLASS_LABEL_KEY[fileClass]) : ''

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={submitting ? undefined : onDismiss}
        style={keyboardHeight > 0 ? { marginBottom: keyboardHeight } : undefined}
      >
        <Dialog.Title>{subtitle || t('drive.createOffice.title')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('drive.createOffice.title')}
            value={name}
            onChangeText={setName}
            autoFocus
            autoCapitalize="sentences"
            disabled={submitting}
            onSubmitEditing={handleSubmit}
            returnKeyType="done"
          />
          <HelperText type="error" visible={!!error}>
            {error ?? ''}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={submitting}>
            {t('common.cancel')}
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={submitting}
            disabled={!name.trim() || submitting}
          >
            {t('drive.createOffice.submit')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
