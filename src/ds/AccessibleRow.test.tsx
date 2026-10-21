import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import { AccessibleRow } from './AccessibleRow'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('AccessibleRow', () => {
  it('announces the composed label rather than the visible texts', () => {
    render(
      wrap(
        <AccessibleRow
          testID="row"
          title="rapport.pdf"
          description="12 ko · hier"
          label="rapport.pdf, fichier PDF, 12 ko, modifié hier"
          onPress={jest.fn()}
        />
      )
    )
    expect(screen.getByTestId('row').props.accessibilityLabel).toBe(
      'rapport.pdf, fichier PDF, 12 ko, modifié hier'
    )
  })

  it('takes the button role when it is pressable', () => {
    render(
      wrap(<AccessibleRow testID="row" title="Documents" label="Documents" onPress={jest.fn()} />)
    )
    expect(screen.getByTestId('row').props.accessibilityRole).toBe('button')
  })

  // A settings row that only displays a value (the app version) must not be
  // announced as something you can activate.
  it('takes no role when it is not pressable', () => {
    render(wrap(<AccessibleRow testID="row" title="Version" label="Version, 0.6.3" />))
    expect(screen.getByTestId('row').props.accessibilityRole).toBeUndefined()
  })

  it('leaves what it holds to be reached on its own when it is not pressable', () => {
    render(wrap(<AccessibleRow testID="row" title="Wi-Fi" label="Wi-Fi" />))
    expect(screen.getByTestId('row').props.accessible).toBe(false)
  })

  it('stays one element when it is pressable', () => {
    render(wrap(<AccessibleRow testID="row" title="Wi-Fi" label="Wi-Fi" onPress={jest.fn()} />))
    expect(screen.getByTestId('row').props.accessible).not.toBe(false)
  })

  it('stays one element when it is only long-pressable', () => {
    render(wrap(<AccessibleRow testID="row" title="Wi-Fi" label="Wi-Fi" onLongPress={jest.fn()} />))
    expect(screen.getByTestId('row').props.accessible).not.toBe(false)
  })

  // A folder picker row that cannot receive the move is announced dimmed, as
  // one element carrying its composed label.
  it('stays one element when it is disabled', () => {
    render(wrap(<AccessibleRow testID="row" title="Archives" label="Archives" disabled />))
    expect(screen.getByTestId('row').props.accessible).not.toBe(false)
  })

  it('honours an explicit role over the pressable default', () => {
    render(
      wrap(
        <AccessibleRow
          testID="row"
          role="radio"
          title="Sombre"
          label="Sombre"
          onPress={jest.fn()}
        />
      )
    )
    expect(screen.getByTestId('row').props.accessibilityRole).toBe('radio')
  })

  it('forwards the hint describing what the press does', () => {
    render(
      wrap(
        <AccessibleRow
          testID="row"
          title="Documents"
          label="Documents"
          hint="Ouvre le dossier"
          onPress={jest.fn()}
        />
      )
    )
    expect(screen.getByTestId('row').props.accessibilityHint).toBe('Ouvre le dossier')
  })

  // Selection is tinted background only, which no screen reader can see.
  it('exposes the selected state', () => {
    render(
      wrap(
        <AccessibleRow testID="row" title="note.md" label="note.md" selected onPress={jest.fn()} />
      )
    )
    expect(screen.getByTestId('row').props.accessibilityState).toMatchObject({ selected: true })
  })

  it('exposes the checked state', () => {
    render(
      wrap(
        <AccessibleRow
          testID="row"
          role="radio"
          title="Sombre"
          label="Sombre"
          checked
          onPress={jest.fn()}
        />
      )
    )
    expect(screen.getByTestId('row').props.accessibilityState).toMatchObject({ checked: true })
  })

  it('exposes the disabled state', () => {
    render(wrap(<AccessibleRow testID="row" title="Archives" label="Archives" disabled />))
    expect(screen.getByTestId('row').props.accessibilityState).toMatchObject({ disabled: true })
  })

  // An unset state must stay undefined rather than `false`: sending
  // `selected: false` makes VoiceOver announce "not selected" on every pass over
  // a row that cannot be selected at all.
  it('leaves an unset state undefined rather than false', () => {
    render(
      wrap(<AccessibleRow testID="row" title="Documents" label="Documents" onPress={jest.fn()} />)
    )
    const { accessibilityState } = screen.getByTestId('row').props
    expect(accessibilityState.selected).toBeUndefined()
    expect(accessibilityState.checked).toBeUndefined()
  })
})
