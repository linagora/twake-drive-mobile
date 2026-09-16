import React, { useState, useEffect } from 'react'
import { Keyboard } from 'react-native'
import { Button, Dialog, HelperText, Portal, TextInput } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  /** Current name pre-filled in the input. Updated when `visible` becomes true. */
  initialName: string
  /** 'file' or 'directory' — drives the dialog title. */
  type?: 'file' | 'directory'
  onDismiss: () => void
  onSubmit: (newName: string) => Promise<void>
}

export const RenameDialog = ({ visible, initialName, type, onDismiss, onSubmit }: Props) => {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Paper centres the dialog in its own overlay and does nothing about the
  // keyboard. Inside the metadata page sheet nothing resizes either, so the
  // input sat under the keyboard: the user typed with no visible field.
  const [keyboardHeight, setKeyboardHeight] = useState(0)

  useEffect(() => {
    if (!visible) {
      setKeyboardHeight(0)
      return
    }
    const shown = Keyboard.addListener('keyboardDidShow', e =>
      setKeyboardHeight(e.endCoordinates.height)
    )
    const hidden = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [visible])

  useEffect(() => {
    if (visible) {
      setName(initialName)
      setError(null)
      setSubmitting(false)
    }
  }, [visible, initialName])

  const trimmed = name.trim()
  const unchanged = trimmed === initialName.trim()

  const handleSubmit = async () => {
    if (!trimmed || unchanged || submitting) return
    setSubmitting(true)
    setError(null)
    try {
      await onSubmit(trimmed)
    } catch (e) {
      const err = e as Error
      if (err.name === 'RenameConflictError') {
        setError(t('drive.rename.errorConflict'))
      } else {
        setError(t('drive.rename.errorGeneric'))
      }
      setSubmitting(false)
      return
    }
    setSubmitting(false)
  }

  const titleKey = type === 'directory' ? 'drive.rename.titleFolder' : 'drive.rename.titleFile'

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={submitting ? undefined : onDismiss}
        style={keyboardHeight > 0 ? { marginBottom: keyboardHeight } : undefined}
      >
        <Dialog.Title>{t(titleKey)}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            mode="outlined"
            label={t('drive.rename.nameLabel')}
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
            disabled={!trimmed || unchanged || submitting}
          >
            {t('drive.rename.submit')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
