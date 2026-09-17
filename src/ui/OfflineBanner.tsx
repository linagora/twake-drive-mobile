import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

import { useIsOnline } from '@/network/useIsOnline'
import { cozyTokens } from './theme'

export const OfflineBanner = (): React.ReactElement | null => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const theme = useTheme()
  const online = useIsOnline()
  if (online) return null
  return (
    // Below the app bar, not over it: at insets.top the pill landed on the
    // screen title.
    <View pointerEvents="none" style={[styles.wrap, { top: insets.top + APP_BAR_HEIGHT + 8 }]}>
      <View
        style={[
          styles.pill,
          {
            backgroundColor: theme.colors.errorContainer,
            shadowColor: theme.dark ? '#000' : '#222'
          }
        ]}
      >
        <Text style={[styles.text, { color: theme.colors.onErrorContainer }]}>
          {t('drive.offline.banner')}
        </Text>
      </View>
    </View>
  )
}

// Height of the Paper Appbar the banner has to clear.
const APP_BAR_HEIGHT = 56

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: cozyTokens.zIndex.banner,
    elevation: cozyTokens.zIndex.banner
  },
  pill: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: '90%',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 4
  },
  text: {
    fontSize: 13,
    textAlign: 'center'
  }
})
