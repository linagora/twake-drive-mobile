import React, { useState } from 'react'
import { Appbar, Menu } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  title: string
  onBack?: () => void
  onLogout?: () => void
}

export const AppBar = ({ title, onBack, onLogout }: Props) => {
  const { t } = useTranslation()
  const [menuVisible, setMenuVisible] = useState(false)

  return (
    <Appbar.Header>
      {onBack ? <Appbar.BackAction onPress={onBack} /> : null}
      <Appbar.Content title={title} />
      {onLogout ? (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={<Appbar.Action icon="dots-vertical" onPress={() => setMenuVisible(true)} />}
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              onLogout()
            }}
            title={t('common.logout')}
          />
        </Menu>
      ) : null}
    </Appbar.Header>
  )
}
