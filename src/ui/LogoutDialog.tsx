import React from 'react'
import { useTranslation } from 'react-i18next'

import { ConfirmDialog } from '@/ui/ConfirmDialog'

interface Props {
  visible: boolean
  onLogout: (options: { wipe: boolean }) => void
  onDismiss: () => void
}

/**
 * The question asked before a logout the user started: keep what the device
 * holds for the account, or erase it. Every way out of the session goes
 * through it, so a phone handed back is never left with the data by accident.
 */
export const LogoutDialog = ({ visible, onLogout, onDismiss }: Props): React.ReactElement => {
  const { t } = useTranslation()
  return (
    <ConfirmDialog
      visible={visible}
      testID="logout-dialog"
      title={t('settings.logoutTitle')}
      message={t('settings.logoutMessage')}
      confirmLabel={t('common.logout')}
      secondaryLabel={t('settings.logoutAndErase')}
      onSecondary={() => onLogout({ wipe: true })}
      onConfirm={() => onLogout({ wipe: false })}
      onDismiss={onDismiss}
    />
  )
}
