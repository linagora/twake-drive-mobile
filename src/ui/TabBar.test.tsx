import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { TabBar } from './TabBar'

const tabs = [
  { value: 'a', label: 'Alpha', testID: 'tab-a' },
  { value: 'b', label: 'Beta', testID: 'tab-b' }
]

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

describe('TabBar', () => {
  it('marks only the active tab as selected', () => {
    render(wrap(<TabBar tabs={tabs} value="a" onChange={jest.fn()} />))
    expect(screen.getByTestId('tab-a')).toBeSelected()
    expect(screen.getByTestId('tab-b')).not.toBeSelected()
  })

  it('draws the indicator under the active tab only', () => {
    const { rerender } = render(wrap(<TabBar tabs={tabs} value="a" onChange={jest.fn()} />))
    const colorOf = (id: string) =>
      (screen.getByTestId(id).props.style as Array<{ backgroundColor?: string }>).find(
        s => s.backgroundColor
      )?.backgroundColor
    expect(colorOf('tab-a-indicator')).not.toBe('transparent')
    expect(colorOf('tab-b-indicator')).toBe('transparent')
    rerender(wrap(<TabBar tabs={tabs} value="b" onChange={jest.fn()} />))
    expect(colorOf('tab-a-indicator')).toBe('transparent')
  })

  it('reports the pressed tab', () => {
    const onChange = jest.fn()
    render(wrap(<TabBar tabs={tabs} value="a" onChange={onChange} />))
    fireEvent.press(screen.getByTestId('tab-b'))
    expect(onChange).toHaveBeenCalledWith('b')
  })
})
