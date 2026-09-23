import React, { useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, HelperText, IconButton, Text, TextInput, useTheme } from 'react-native-paper'
import { Redirect, router } from 'expo-router'
import { SafeAreaView } from 'react-native-safe-area-context'
import { createMMKV } from 'react-native-mmkv'

import { useAuth } from '@/auth/useAuth'
import { isDevInstanceLoginEnabled } from '@/auth/devInstanceLogin'
import { UserCancelledError } from '@/auth/types'
import { enterDrive } from '@/auth/enterDrive'

const STORAGE_KEY = 'devInstanceUri'

let storage: ReturnType<typeof createMMKV> | null = null
try {
  storage = createMMKV({ id: 'app-preferences' })
} catch {
  storage = null
}

/**
 * Development only, so the strings stay untranslated like the other dev tools.
 *
 * The shipped entry points resolve an instance through the cloudery or an
 * organisation's OIDC discovery; a stack spun up for e2e has neither, which is
 * why there was no way to sign the app into a disposable instance.
 */
export default function DevInstanceScreen() {
  const theme = useTheme()
  const { loginWithInstance } = useAuth()
  const [uri, setUri] = useState(storage?.getString(STORAGE_KEY) ?? '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)

  if (!isDevInstanceLoginEnabled()) return <Redirect href="/(auth)/welcome" />

  const goBack = (): void => {
    if (router.canGoBack()) router.back()
    else router.replace('/(auth)/welcome')
  }

  const onSubmit = async (): Promise<void> => {
    if (inFlight.current) return
    inFlight.current = true
    setError(null)
    setLoading(true)
    try {
      const trimmed = uri.trim()
      storage?.set(STORAGE_KEY, trimmed)
      await loginWithInstance(trimmed)
      enterDrive(router)
    } catch (err) {
      if (!(err instanceof UserCancelledError)) setError((err as Error).message ?? 'Login failed')
    } finally {
      inFlight.current = false
      setLoading(false)
    }
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.colors.background }]}>
      <View style={styles.container}>
        <IconButton
          testID="dev-instance-back"
          icon="arrow-left"
          size={24}
          onPress={goBack}
          accessibilityLabel="Back"
          style={styles.back}
        />

        <Text variant="headlineSmall" style={[styles.title, { color: theme.colors.onSurface }]}>
          Sign in to an instance
        </Text>
        <Text
          variant="bodyMedium"
          style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}
        >
          Development only. Runs the stack OAuth flow against the address below, skipping the
          cloudery. The passphrase is typed on the stack's own page, in the system browser.
        </Text>

        <TextInput
          testID="dev-instance-uri-input"
          label="Instance address"
          placeholder="http://alice.localhost:8080"
          value={uri}
          onChangeText={setUri}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="done"
          onSubmitEditing={() => {
            if (uri.trim() && !loading) void onSubmit()
          }}
          mode="outlined"
          style={styles.field}
        />
        <HelperText type="error" visible={!!error}>
          {error ?? ''}
        </HelperText>

        <Button
          testID="dev-instance-submit"
          mode="contained"
          onPress={() => void onSubmit()}
          disabled={!uri.trim() || loading}
          loading={loading}
          style={styles.btn}
          contentStyle={styles.btnContent}
        >
          Continue
        </Button>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  container: { flex: 1, padding: 24 },
  back: { alignSelf: 'flex-start', margin: 0, marginLeft: -8, marginBottom: 4 },
  title: { marginTop: 16, fontWeight: '800' },
  subtitle: { marginTop: 8, lineHeight: 20 },
  field: { marginTop: 20 },
  btn: { borderRadius: 14 },
  btnContent: { height: 50 }
})
