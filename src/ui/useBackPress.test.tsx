import React from 'react'
import { BackHandler, Text } from 'react-native'
import { act, render } from '@testing-library/react-native'

jest.mock('expo-router', () => {
  const { useEffect } = jest.requireActual<typeof import('react')>('react')
  return { useFocusEffect: (cb: () => void | (() => void)) => useEffect(cb, [cb]) }
})

import { useBackPress } from './useBackPress'

const Probe = ({ active, onBack }: { active: boolean; onBack: () => void }): React.ReactElement => {
  useBackPress(active, onBack)
  return <Text>probe</Text>
}

const backHandlers = new Set<() => boolean | null | undefined>()
beforeEach(() => {
  backHandlers.clear()
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    backHandlers.add(handler)
    return { remove: () => backHandlers.delete(handler) }
  })
})
afterEach(() => jest.restoreAllMocks())

const pressBack = (): void => {
  act(() => {
    ;[...backHandlers].reverse().some(handler => handler())
  })
}

describe('useBackPress', () => {
  it('runs the handler on back while active', () => {
    const onBack = jest.fn()
    render(<Probe active onBack={onBack} />)
    pressBack()
    expect(onBack).toHaveBeenCalledTimes(1)
  })

  it('leaves the back alone while inactive', () => {
    const onBack = jest.fn()
    render(<Probe active={false} onBack={onBack} />)
    pressBack()
    expect(onBack).not.toHaveBeenCalled()
  })

  it('lets go of the back once it turns inactive', () => {
    const onBack = jest.fn()
    const { rerender } = render(<Probe active onBack={onBack} />)
    rerender(<Probe active={false} onBack={onBack} />)
    pressBack()
    expect(onBack).not.toHaveBeenCalled()
  })
})
