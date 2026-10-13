import { useCallback } from 'react'
import { BackHandler } from 'react-native'
import { useFocusEffect } from 'expo-router'

/**
 * Takes the Android system back while `active`, so a transient mode (a
 * selection, an open menu) closes first instead of the app leaving. Only the
 * focused screen takes it: tabs stay mounted behind the one on screen.
 */
export const useBackPress = (active: boolean, onBack: () => void): void => {
  useFocusEffect(
    useCallback(() => {
      if (!active) return undefined
      const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
        onBack()
        return true
      })
      return () => subscription.remove()
    }, [active, onBack])
  )
}
