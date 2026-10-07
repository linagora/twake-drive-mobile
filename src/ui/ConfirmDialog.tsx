import React from 'react'
import { StyleSheet } from 'react-native'
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  title: string
  message: string
  /** Label of the confirming action. Defaults to `common.confirm`. */
  confirmLabel?: string
  /** A second way out, rendered only when both it and `onSecondary` are given. */
  secondaryLabel?: string
  onSecondary?: () => void
  /** Tint the confirm action with the error colour (irreversible actions). */
  destructive?: boolean
  loading?: boolean
  onConfirm: () => void
  onDismiss: () => void
  testID?: string
}

/**
 * Generic confirmation dialog. Use it for any "are you sure?" step;
 * ConfirmDeleteDialog stays the specialised variant for deleting documents,
 * which picks its own copy from the target's type and count.
 */
export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel,
  secondaryLabel,
  onSecondary,
  destructive,
  loading,
  onConfirm,
  onDismiss,
  testID = 'confirm-dialog'
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const theme = useTheme()
  const stacked = Boolean(secondaryLabel && onSecondary)
  const cancel = (
    <Button
      onPress={onDismiss}
      disabled={loading}
      style={stacked ? styles.stackedButton : undefined}
      testID={`${testID}-cancel`}
    >
      {t('common.cancel')}
    </Button>
  )
  const submit = (
    <Button
      onPress={onConfirm}
      loading={loading}
      disabled={loading}
      textColor={destructive ? theme.colors.error : undefined}
      style={stacked ? styles.stackedButton : undefined}
      testID={`${testID}-submit`}
    >
      {confirmLabel ?? t('common.confirm')}
    </Button>
  )
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} dismissable={!loading}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        {secondaryLabel && onSecondary ? (
          // Three long translated labels never fit one row: stack them
          // full-width, confirming first and cancelling last.
          <Dialog.Actions style={styles.stacked} testID={`${testID}-actions-stacked`}>
            {submit}
            <Button
              onPress={onSecondary}
              disabled={loading}
              style={styles.stackedButton}
              testID={`${testID}-secondary`}
            >
              {secondaryLabel}
            </Button>
            {cancel}
          </Dialog.Actions>
        ) : (
          <Dialog.Actions>
            {cancel}
            {submit}
          </Dialog.Actions>
        )}
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  stacked: { flexDirection: 'column', alignItems: 'stretch' },
  stackedButton: { alignSelf: 'stretch' }
})
