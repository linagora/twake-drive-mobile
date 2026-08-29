import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import { SettingsRow } from './SettingsRow'
import { cozyTokens } from './theme'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('SettingsRow', () => {
  it('renders the title and description', () => {
    render(wrap(<SettingsRow title="Langue" description="Français" />))
    expect(screen.getByText('Langue')).toBeOnTheScreen()
    expect(screen.getByText('Français')).toBeOnTheScreen()
  })

  it('calls onPress when tapped', () => {
    const onPress = jest.fn()
    render(wrap(<SettingsRow testID="row" title="Langue" onPress={onPress} />))
    fireEvent.press(screen.getByTestId('row'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  // Rows with and without an icon must share the same text baseline: the
  // leading slot is always reserved, otherwise the list gets a ragged left edge.
  it('reserves a fixed-width leading slot even without an icon', () => {
    render(wrap(<SettingsRow title="Système" />))
    const slot = screen.getByTestId('settings-row-leading')
    const style = Object.assign({}, ...[slot.props.style].flat().filter(Boolean))
    expect(style.width).toBe(cozyTokens.rowLeadingSlot)
  })

  it('renders a custom accessory instead of the trailing affordance', () => {
    render(
      wrap(
        <SettingsRow
          title="Wi-Fi"
          trailing="chevron"
          accessory={<Text testID="custom-accessory">on</Text>}
        />
      )
    )
    expect(screen.getByTestId('custom-accessory')).toBeOnTheScreen()
  })
})
