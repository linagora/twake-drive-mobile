import React, { useState } from 'react'
import { Linking, Pressable, StyleSheet, View } from 'react-native'
import { Appbar, Avatar, Menu, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useRouter } from 'expo-router'

import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { CozyIcon } from '@/ui/icons/CozyIcon'
import { useCurrentUser } from '@/account/useCurrentUser'
import { cozyTokens } from '@/ui/theme'

export interface AppBarSelectionAction {
  icon: string
  onPress: () => void
  accessibilityLabel?: string
  /** Render this action in the error/destructive tint. */
  destructive?: boolean
  /** Hide the action without removing it from the array (so layout is stable). */
  hidden?: boolean
  /** Stable id for E2E (Maestro) targeting — the accessibilityLabel alone is
   * ambiguous (shared with row menus / dialog buttons). */
  testID?: string
}

interface AppBarSelection {
  count: number
  onCancel: () => void
  actions: AppBarSelectionAction[]
}

interface Props {
  title: string
  onBack?: () => void
  /**
   * Renders a leading close (✕) action instead of the back arrow. Used by the
   * modal routes (settings) whose root screen dismisses rather than pops.
   */
  onClose?: () => void
  onLogout?: () => void
  /**
   * When true, a help icon button is rendered to the left of the avatar menu.
   * Tapping it opens twake.app in the system browser.
   *
   * Despite the name this does NOT surface the file-name search screen: search
   * lives at /search and is currently only reachable by deep link.
   */
  showSearch?: boolean
  /**
   * When set, the AppBar swaps to selection mode: the title shows the
   * count, the back/menu controls are replaced with a close action, and
   * the provided actions are rendered on the right.
   */
  selection?: AppBarSelection
}

export const AppBar = ({ title, onBack, onClose, onLogout, showSearch, selection }: Props) => {
  const { t } = useTranslation()
  const [menuVisible, setMenuVisible] = useState(false)
  const theme = useTheme()
  const router = useRouter()
  const { initials } = useCurrentUser()

  if (selection) {
    return (
      <Appbar.Header>
        <Appbar.Action
          icon={p => (
            <CozyIcon name="cross" size={p?.size ?? cozyTokens.iconSize.md} color={p?.color} />
          )}
          onPress={selection.onCancel}
          accessibilityLabel={t('common.cancel')}
        />
        <Appbar.Content title={t('drive.selection.count', { count: selection.count })} />
        {selection.actions
          .filter(a => !a.hidden)
          .map((a, idx) => (
            <Appbar.Action
              key={`${a.icon}-${idx}`}
              icon={a.icon}
              onPress={a.onPress}
              accessibilityLabel={a.accessibilityLabel}
              color={a.destructive ? theme.colors.error : undefined}
              testID={a.testID}
            />
          ))}
      </Appbar.Header>
    )
  }

  return (
    <Appbar.Header>
      {onBack ? (
        <Appbar.Action
          isLeading
          animated={false}
          icon={p => (
            <CozyIcon
              name="previous"
              size={p?.size ?? cozyTokens.iconSize.md}
              color={theme.colors.onSurface}
            />
          )}
          onPress={onBack}
          accessibilityLabel={t('common.back')}
          testID="appbar-back-button"
        />
      ) : null}
      {onClose ? (
        <Appbar.Action
          isLeading
          animated={false}
          icon={p => (
            <CozyIcon
              name="cross"
              size={p?.size ?? cozyTokens.iconSize.md}
              color={theme.colors.onSurface}
            />
          )}
          onPress={onClose}
          accessibilityLabel={t('common.close')}
          testID="appbar-close-button"
        />
      ) : null}
      <View style={styles.logo}>
        <TwakeLogo size={cozyTokens.logoSize.appBar} />
      </View>
      <Appbar.Content title={title} />
      {showSearch ? (
        <Pressable
          onPress={() => Linking.openURL('https://twake.app')}
          accessibilityLabel={t('common.help')}
          style={styles.searchButton}
          testID="appbar-help-button"
        >
          <CozyIcon name="info" size={cozyTokens.iconSize.md} color={theme.colors.onSurface} />
        </Pressable>
      ) : null}
      {onLogout ? (
        <Menu
          visible={menuVisible}
          onDismiss={() => setMenuVisible(false)}
          anchor={
            <Pressable onPress={() => setMenuVisible(true)}>
              <Avatar.Text size={cozyTokens.avatarSize.sm} label={initials} />
            </Pressable>
          }
        >
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              router.push('/settings')
            }}
            title={t('settings.title')}
            leadingIcon={() => (
              <CozyIcon name="cog" size={cozyTokens.iconSize.md} color={theme.colors.onSurface} />
            )}
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              router.push('/(drive)/shareddrives')
            }}
            title={t('drive.sharedDrives')}
            leadingIcon={() => (
              <CozyIcon
                name="folderMultiple"
                size={cozyTokens.iconSize.md}
                color={theme.colors.onSurface}
              />
            )}
          />
          <Menu.Item
            onPress={() => {
              setMenuVisible(false)
              onLogout()
            }}
            title={t('common.logout')}
            leadingIcon={() => (
              <CozyIcon
                name="logout"
                size={cozyTokens.iconSize.md}
                color={theme.colors.onSurface}
              />
            )}
          />
        </Menu>
      ) : null}
    </Appbar.Header>
  )
}

const styles = StyleSheet.create({
  logo: {
    marginLeft: cozyTokens.spacing.xs,
    marginRight: cozyTokens.spacing.xs,
    justifyContent: 'center'
  },
  searchButton: {
    marginHorizontal: cozyTokens.spacing.xs,
    padding: cozyTokens.spacing.xs + cozyTokens.spacing.xxs,
    justifyContent: 'center',
    alignItems: 'center'
  }
})
