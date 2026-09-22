import React from 'react'
import { Text } from 'react-native'
import { render, screen, act } from '@testing-library/react-native'
import flag from 'cozy-flags'

import { useFlag } from './useFlag'

const Probe = (): React.ReactElement => {
  const enabled = useFlag('drive.onlyoffice.enabled')
  return <Text>{enabled ? 'on' : 'off'}</Text>
}

describe('useFlag', () => {
  beforeEach(() => {
    flag('drive.onlyoffice.enabled', null)
  })

  it('answers what the flag holds', () => {
    flag('drive.onlyoffice.enabled', true)
    render(<Probe />)
    expect(screen.getByText('on')).toBeOnTheScreen()
  })

  it('brings the component back when the flags land after it mounted', () => {
    render(<Probe />)
    expect(screen.getByText('off')).toBeOnTheScreen()

    act(() => {
      flag('drive.onlyoffice.enabled', true)
    })

    expect(screen.getByText('on')).toBeOnTheScreen()
  })
})
