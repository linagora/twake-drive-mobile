import React from 'react'
import { StyleSheet, View } from 'react-native'
import { ActivityIndicator } from 'react-native-paper'

export const LoadingState = () => (
  <View style={styles.container} testID="loading-state">
    <ActivityIndicator animating size="large" />
  </View>
)

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' }
})
