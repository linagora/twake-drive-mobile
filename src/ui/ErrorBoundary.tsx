import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Button, Text } from 'react-native-paper'
import { withTranslation, WithTranslation } from 'react-i18next'

interface State {
  hasError: boolean
}

class ErrorBoundaryClass extends React.Component<
  WithTranslation & { children: React.ReactNode },
  State
> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error) {
    console.error('[ErrorBoundary]', error)
  }

  reset = () => this.setState({ hasError: false })

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <View style={styles.container}>
        <Text variant="headlineSmall" style={styles.title}>
          {this.props.t('errors.generic')}
        </Text>
        <Button mode="contained" onPress={this.reset} style={styles.button}>
          {this.props.t('common.retry')}
        </Button>
      </View>
    )
  }
}

export const ErrorBoundary = withTranslation()(ErrorBoundaryClass)

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  title: { textAlign: 'center', marginBottom: 16 },
  button: { marginTop: 8 }
})
