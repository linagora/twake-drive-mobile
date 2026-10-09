import React, { useEffect, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Dialog, HelperText, Portal, Text, TextInput } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { PASSWORD_MIN_LENGTH, isValidLinkPassword } from '@/files/sharing'

import { useKeyboardOffset } from './useKeyboardOffset'

interface Props {
  hasPassword: boolean
  disabled?: boolean
  onSavePassword: (password: string) => void
  onRemovePassword: () => void
}

interface PasswordDialogProps {
  visible: boolean
  onDismiss: () => void
  onSubmit: (password: string) => void
}

const PasswordDialog = ({ visible, onDismiss, onSubmit }: PasswordDialogProps) => {
  const { t } = useTranslation()
  const keyboardHeight = useKeyboardOffset(visible)
  const [password, setPassword] = useState('')
  const [shown, setShown] = useState(false)
  const [touched, setTouched] = useState(false)

  // Never prefilled: the stack does not return the current password.
  useEffect(() => {
    if (visible) {
      setPassword('')
      setShown(false)
      setTouched(false)
    }
  }, [visible])

  const valid = isValidLinkPassword(password)

  const submit = (): void => {
    if (!valid) {
      setTouched(true)
      return
    }
    onSubmit(password)
  }

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={onDismiss}
        style={keyboardHeight > 0 ? { marginBottom: keyboardHeight } : undefined}
      >
        <Dialog.Title>{t('drive.share.linkPasswordText')}</Dialog.Title>
        <Dialog.Content>
          <TextInput
            testID="share-link-password-input"
            mode="outlined"
            label={t('drive.share.linkPasswordLabel')}
            accessibilityLabel={t('drive.share.linkPasswordLabel')}
            value={password}
            onChangeText={setPassword}
            onBlur={() => setTouched(true)}
            secureTextEntry={!shown}
            autoCapitalize="none"
            autoCorrect={false}
            autoFocus
            onSubmitEditing={submit}
            returnKeyType="done"
            right={
              <TextInput.Icon
                testID="share-link-password-toggle"
                icon={shown ? 'eye-off-outline' : 'eye-outline'}
                onPress={() => setShown(s => !s)}
                accessibilityLabel={t(
                  shown ? 'drive.share.linkPasswordHide' : 'drive.share.linkPasswordShow'
                )}
              />
            }
          />
          <HelperText type={touched && !valid ? 'error' : 'info'} visible>
            {t('drive.share.linkPasswordHint', { min: PASSWORD_MIN_LENGTH })}
          </HelperText>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.cancel')}</Button>
          <Button
            mode="contained"
            testID="share-link-password-submit"
            onPress={submit}
            disabled={!valid}
          >
            {t('common.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

/**
 * Password of a public link, as twake-drive web's share-link modal
 * (cozy-sharing's BoxPassword) offers it.
 * It only asks; the caller makes the stack call.
 */
export const PublicLinkSettings = ({
  hasPassword,
  disabled = false,
  onSavePassword,
  onRemovePassword
}: Props) => {
  const { t } = useTranslation()
  const [passwordOpen, setPasswordOpen] = useState(false)

  return (
    <View style={styles.container} testID="share-link-settings">
      <View style={styles.row}>
        <View style={styles.text}>
          <Text variant="bodyMedium">{t('drive.share.linkPasswordText')}</Text>
          <Text variant="bodySmall" testID="share-link-password-state">
            {t(hasPassword ? 'drive.share.linkPasswordSet' : 'drive.share.linkPasswordNone')}
          </Text>
        </View>
        <Button
          compact
          testID="share-link-password-edit"
          accessibilityLabel={t(
            hasPassword ? 'drive.share.linkPasswordChangeLabel' : 'drive.share.linkPasswordSetLabel'
          )}
          disabled={disabled}
          onPress={() => setPasswordOpen(true)}
        >
          {t(hasPassword ? 'drive.share.linkChange' : 'drive.share.linkSet')}
        </Button>
        {hasPassword ? (
          <Button
            compact
            testID="share-link-password-remove"
            accessibilityLabel={t('drive.share.linkPasswordRemoveLabel')}
            disabled={disabled}
            onPress={onRemovePassword}
          >
            {t('drive.share.linkRemove')}
          </Button>
        ) : null}
      </View>

      <PasswordDialog
        visible={passwordOpen}
        onDismiss={() => setPasswordOpen(false)}
        onSubmit={password => {
          setPasswordOpen(false)
          onSavePassword(password)
        }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 4 },
  row: { flexDirection: 'row', alignItems: 'center' },
  text: { flex: 1 }
})
