import React from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import * as Clipboard from 'expo-clipboard'
import { withTranslation, WithTranslation } from 'react-i18next'

import { reportCaughtError } from '@/monitoring/crashReporting'

interface State {
  hasError: boolean
  details: string | null
  showDetails: boolean
  copied: boolean
}

const formatDetails = (error: Error, componentStack?: string | null): string =>
  [
    `${error.name}: ${error.message}`,
    error.stack ?? '',
    componentStack ? `\nComponent stack:${componentStack}` : ''
  ]
    .filter(Boolean)
    .join('\n')
    .trim()

class ErrorBoundaryClass extends React.Component<
  WithTranslation & { children: React.ReactNode },
  State
> {
  state: State = { hasError: false, details: null, showDetails: false, copied: false }

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: { componentStack?: string | null }) {
    console.error('[ErrorBoundary]', error)
    reportCaughtError(error, { componentStack: errorInfo?.componentStack ?? null })
    // Release builds forward no JS console anywhere, so this text stays the
    // only channel for a user who left crash reports off.
    this.setState({ details: formatDetails(error, errorInfo?.componentStack) })
  }

  reset = (): void =>
    this.setState({ hasError: false, details: null, showDetails: false, copied: false })

  toggleDetails = (): void => this.setState(s => ({ showDetails: !s.showDetails }))

  copyDetails = (): void => {
    const { details } = this.state
    if (!details) return
    void Clipboard.setStringAsync(details)
      .then(() => this.setState({ copied: true }))
      .catch(() => undefined)
  }

  render() {
    const { t } = this.props
    const { hasError, details, showDetails, copied } = this.state
    if (!hasError) return this.props.children
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall" style={styles.title}>
          {t('errors.generic')}
        </Text>
        <Button mode="contained" onPress={this.reset} style={styles.button}>
          {t('common.retry')}
        </Button>
        {details ? (
          <>
            <Button mode="text" onPress={this.toggleDetails} testID="error-details-toggle">
              {t(showDetails ? 'errors.hideDetails' : 'errors.showDetails')}
            </Button>
            {showDetails ? (
              <View style={styles.detailsBox}>
                <ScrollView style={styles.detailsScroll}>
                  <Text selectable variant="bodySmall" testID="error-details-text">
                    {details}
                  </Text>
                </ScrollView>
                <Button mode="outlined" onPress={this.copyDetails} testID="error-details-copy">
                  {t(copied ? 'errors.copied' : 'errors.copyDetails')}
                </Button>
              </View>
            ) : null}
          </>
        ) : null}
      </View>
    )
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryClass)

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center', marginBottom: 16 },
  button: { marginTop: 8 },
  detailsBox: { alignSelf: 'stretch', marginTop: 8 },
  detailsScroll: { maxHeight: 260, marginBottom: 12 }
})
