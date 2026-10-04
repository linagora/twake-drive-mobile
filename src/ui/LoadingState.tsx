import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator, Text } from 'react-native-paper'
import { useTranslation } from 'react-i18next'

interface Props {
  message?: string
}

export const LoadingState = ({ message }: Props) => {
  const { t } = useTranslation()
  return (
    <View style={styles.container} testID="loading-state">
      <ActivityIndicator
        animating
        size="large"
        accessibilityLabel={message ? undefined : t('common.loading')}
      />
      {message ? (
        <Text variant="bodyLarge" style={styles.message}>
          {message}
        </Text>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  message: { marginTop: 16, textAlign: 'center' }
})
