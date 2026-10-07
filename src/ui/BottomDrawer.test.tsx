import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native'

import '@/i18n'
import { BottomDrawer, BottomDrawerItem } from './BottomDrawer'

const metrics = {
  frame: { x: 0, y: 0, width: 360, height: 800 },
  insets: { top: 0, left: 0, right: 0, bottom: 24 }
}

const wrap = (ui: React.ReactElement) =>
  render(
    <SafeAreaProvider initialMetrics={metrics}>
      <PaperProvider>{ui}</PaperProvider>
    </SafeAreaProvider>
  )

describe('BottomDrawer', () => {
  it('renders nothing while closed', () => {
    wrap(
      <BottomDrawer visible={false} onClose={jest.fn()} title="rapport.pdf">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} testID="item" />
      </BottomDrawer>
    )
    expect(screen.queryByTestId('item')).toBeNull()
  })

  it('shows the title and its actions when open', () => {
    wrap(
      <BottomDrawer visible onClose={jest.fn()} title="rapport.pdf">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} testID="item" />
      </BottomDrawer>
    )
    expect(screen.getByText('rapport.pdf')).toBeTruthy()
    expect(screen.getByTestId('item')).toBeTruthy()
  })

  it('closes when the backdrop is tapped', () => {
    const onClose = jest.fn()
    wrap(
      <BottomDrawer visible onClose={onClose} title="x">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} />
      </BottomDrawer>
    )
    fireEvent.press(screen.getByTestId('bottom-drawer-backdrop', { includeHiddenElements: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('closes on the Android back button (Modal onRequestClose)', () => {
    const onClose = jest.fn()
    wrap(
      <BottomDrawer visible onClose={onClose} title="x">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} />
      </BottomDrawer>
    )
    act(() => {
      screen.getByTestId('bottom-drawer').props.onRequestClose()
    })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('calls the action handler on press', () => {
    const onPress = jest.fn()
    wrap(
      <BottomDrawer visible onClose={jest.fn()}>
        <BottomDrawerItem label="Share" icon="share" onPress={onPress} testID="item" />
      </BottomDrawer>
    )
    fireEvent.press(screen.getByTestId('item'))
    expect(onPress).toHaveBeenCalledTimes(1)
  })

  it('exposes a disabled item as disabled and does not fire it', () => {
    const onPress = jest.fn()
    wrap(
      <BottomDrawer visible onClose={jest.fn()}>
        <BottomDrawerItem label="Share" icon="share" onPress={onPress} disabled testID="item" />
      </BottomDrawer>
    )
    const item = screen.getByTestId('item')
    expect(item.props.accessibilityState).toEqual({ disabled: true })
    fireEvent.press(item)
    expect(onPress).not.toHaveBeenCalled()
  })

  it('labels the item with its text and the sheet as a modal', () => {
    wrap(
      <BottomDrawer visible onClose={jest.fn()} title="x">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} testID="item" />
      </BottomDrawer>
    )
    expect(screen.getByTestId('item').props.accessibilityLabel).toBe('Share')
    expect(screen.getByTestId('bottom-drawer-sheet').props.accessibilityViewIsModal).toBe(true)
    expect(screen.getByTestId('bottom-drawer-header').props.accessibilityRole).toBe('header')
  })

  it('keeps the bottom inset clear', () => {
    wrap(
      <BottomDrawer visible onClose={jest.fn()} title="x">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} />
      </BottomDrawer>
    )
    const style = [screen.getByTestId('bottom-drawer-sheet').props.style].flat(2)
    const padding = style.find(s => s && typeof s === 'object' && 'paddingBottom' in s)
    expect(padding.paddingBottom).toBe(24)
  })

  it('unmounts once closed', async () => {
    const { rerender } = wrap(
      <BottomDrawer visible onClose={jest.fn()} title="x">
        <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} testID="item" />
      </BottomDrawer>
    )
    rerender(
      <SafeAreaProvider initialMetrics={metrics}>
        <PaperProvider>
          <BottomDrawer visible={false} onClose={jest.fn()} title="x">
            <BottomDrawerItem label="Share" icon="share" onPress={jest.fn()} testID="item" />
          </BottomDrawer>
        </PaperProvider>
      </SafeAreaProvider>
    )
    await waitFor(() => expect(screen.queryByTestId('item')).toBeNull())
  })
})
