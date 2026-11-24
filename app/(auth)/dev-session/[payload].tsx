import React, { useEffect, useState } from 'react'
import { StyleSheet } from 'react-native'
import { HelperText } from 'react-native-paper'
import { Redirect, router, useLocalSearchParams } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'

import { useAuth } from '@/auth/useAuth'
import { isDevInstanceLoginEnabled } from '@/auth/devInstanceLogin'
import { decodeDevSession } from '@/auth/devSession'
import { enterDrive } from '@/auth/enterDrive'

/**
 * Development only, like the instance address screen: signs the app in with a
 * session an e2e run minted on its stack (`twakedrive:///dev-session/<payload>`),
 * so a flow that signed out comes back without the browser sign-in.
 */
export default function DevSessionScreen() {
  const { payload } = useLocalSearchParams<{ payload: string }>()
  const { loginWithSession } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const enabled = isDevInstanceLoginEnabled()

  useEffect(() => {
    if (!enabled || !payload) return
    const signIn = async (): Promise<void> => {
      try {
        await loginWithSession(decodeDevSession(payload))
        enterDrive(router)
      } catch (err) {
        setError((err as Error).message ?? 'Login failed')
      }
    }
    void signIn()
  }, [enabled, payload, loginWithSession])

  if (!enabled) return <Redirect href="/(auth)/welcome" />

  return (
    <SafeAreaView style={styles.safe}>
      <HelperText testID="dev-session-error" type="error" visible={!!error}>
        {error ?? ''}
      </HelperText>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, padding: 24 }
})
