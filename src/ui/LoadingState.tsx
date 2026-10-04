import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

export const LoadingState = () => {
  const { t } = useTranslation()
  return (
    <View style={styles.container} testID="loading-state">
      <ActivityIndicator animating size="large" accessibilityLabel={t('common.loading')} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' }
})
