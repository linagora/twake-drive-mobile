import React from 'react'
import { Text } from 'react-native'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper'

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

  describe('accessibility', () => {
    it('announces the title and its description as one label', () => {
      render(wrap(<SettingsRow testID="row" title="Langue" description="Français" />))
      expect(screen.getByTestId('row').props.accessibilityLabel).toBe('Langue, Français')
    })

    it('is announced as a button when it drills down', () => {
      render(wrap(<SettingsRow testID="row" title="Langue" onPress={jest.fn()} />))
      expect(screen.getByTestId('row').props.accessibilityRole).toBe('button')
    })

    // The version row only displays a value; announcing it as a button invites
    // the user to activate something that does nothing.
    it('is not announced as a button when it only displays a value', () => {
      render(wrap(<SettingsRow testID="row" title="Version" description="0.6.3" />))
      expect(screen.getByTestId('row').props.accessibilityRole).toBeUndefined()
    })

    it('is announced as a radio button carrying its checked state when it is an option', () => {
      render(wrap(<SettingsRow testID="row" title="Sombre" radioChecked onPress={jest.fn()} />))
      const row = screen.getByTestId('row')
      expect(row.props.accessibilityRole).toBe('radio')
      expect(row.props.accessibilityState).toEqual(expect.objectContaining({ checked: true }))
    })

    it('leaves the checked state out of a row that is not an option', () => {
      render(wrap(<SettingsRow testID="row" title="Langue" onPress={jest.fn()} />))
      expect(screen.getByTestId('row').props.accessibilityState?.checked).toBeUndefined()
    })
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

  it('tints a destructive row with the error colour', () => {
    render(wrap(<SettingsRow title="Supprimer le compte" destructive />))
    const title = screen.getByText('Supprimer le compte')
    const style = Object.assign({}, ...[title.props.style].flat(Infinity).filter(Boolean))
    expect(style.color).toBe(MD3LightTheme.colors.error)
  })
})
