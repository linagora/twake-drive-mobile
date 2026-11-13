import React, { useEffect, useState } from 'react'
import { Button, Dialog, Portal, Text } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { models, useInstanceInfo } from 'cozy-client'

/** Past this, a settings query that failed (offline) no longer holds the paywall back. */
const INSTANCE_WAIT_MS = 3000

interface Props {
  onClose: () => void
}

/**
 * The paywall Drive web shows on a full Drive, as cozy-ui-plus renders it in
 * the flagship app without in-app purchase: the plans are told about where the
 * instance offers them, never linked to, as the stores ask.
 */
export const QuotaPaywall = ({ onClose }: Props): React.ReactElement => {
  const { t } = useTranslation()
  const info = useInstanceInfo()
  const [waited, setWaited] = useState(false)
  useEffect(() => {
    const timer = setTimeout(() => setWaited(true), INSTANCE_WAIT_MS)
    return () => clearTimeout(timer)
  }, [])
  const premium =
    models.instance.arePremiumLinksEnabled(info) && Boolean(models.instance.buildPremiumLink(info))
  return (
    <Portal>
      <Dialog visible={info.isLoaded || waited} onDismiss={onClose} testID="quota-paywall">
        <Dialog.Title>
          {t(premium ? 'backup.paywall.premiumTitle' : 'backup.paywall.defaultTitle')}
        </Dialog.Title>
        <Dialog.Content>
          <Text variant="bodyMedium">
            {t(premium ? 'backup.paywall.premiumContent' : 'backup.paywall.defaultContent')}
          </Text>
        </Dialog.Content>
        <Dialog.Actions>
          <Button testID="quota-paywall-close" mode="contained" onPress={onClose}>
            {t('backup.paywall.understood')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}
