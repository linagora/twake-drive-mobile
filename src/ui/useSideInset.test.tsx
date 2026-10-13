import React from 'react'
import { Text } from 'react-native'
import { render, screen } from '@testing-library/react-native'

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 48 })
}))

import { useSideInset } from './useSideInset'

const Probe = (): React.ReactElement => <Text testID="inset">{String(useSideInset())}</Text>

describe('useSideInset', () => {
  // Paper's app bar and the tab bar pad both sides by the larger one.
  it('takes the larger of the two sides', () => {
    render(<Probe />)
    expect(screen.getByTestId('inset')).toHaveTextContent('48')
  })
})
