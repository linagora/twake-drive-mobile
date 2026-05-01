import { MD3LightTheme, MD3DarkTheme, MD3Theme } from 'react-native-paper'

const twakeColors = {
  primary: '#0072B2',
  primaryContainer: '#CCE6F4',
  secondary: '#5B7180',
  surface: '#FFFFFF',
  background: '#F5F7FA',
  error: '#D32F2F'
}

const twakeColorsDark = {
  primary: '#5BB6E6',
  primaryContainer: '#003D5C',
  secondary: '#9AAFBC',
  surface: '#1E2126',
  background: '#15171A',
  error: '#EF5350'
}

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...twakeColors
  }
}

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...twakeColorsDark
  }
}
