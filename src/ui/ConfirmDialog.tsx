import React from 'react'
import { Button, Dialog, Portal, Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  visible: boolean
  title: string
  message: string
  /** Label of the confirming action. Defaults to `common.confirm`. */
  confirmLabel?: string
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
  destructive,
  loading,
  onConfirm,
  onDismiss,
  testID = 'confirm-dialog'
}: Props): React.ReactElement => {
  const { t } = useTranslation()
  const theme = useTheme()
  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} dismissable={!loading}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">{message}</Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={loading} testID={`${testID}-cancel`}>
            {t('common.cancel')}
          </Button>
          <Button
            onPress={onConfirm}
            loading={loading}
            disabled={loading}
            textColor={destructive ? theme.colors.error : undefined}
            testID={`${testID}-submit`}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
