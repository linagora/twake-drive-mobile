import React from 'react'
import { StyleSheet, Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { useIsOnline } from '@/network/useIsOnline'

export const OfflineBanner = (): React.ReactElement | null => {
  const { t } = useTranslation()
  const insets = useSafeAreaInsets()
  const online = useIsOnline()
  if (online) return null
  return (
    <View
      pointerEvents="none"
      style={[styles.wrap, { top: insets.top + 8 }]}
    >
      <View style={styles.pill}>
        <Text style={styles.text}>{t('drive.offline.banner')}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 100,
    elevation: 100
  },
  pill: {
    backgroundColor: '#1f2937',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 999,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4
  },
  text: {
    color: '#fff',
    fontSize: 13,
    textAlign: 'center'
  }
})
