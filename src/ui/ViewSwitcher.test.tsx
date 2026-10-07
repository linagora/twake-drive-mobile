import React from 'react'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'
import { ViewSwitcher } from './ViewSwitcher'
import { useViewMode, setViewMode } from './useViewMode'

const wrap = (ui: React.ReactElement) => <PaperProvider>{ui}</PaperProvider>

beforeEach(() => {
  // Reset to default 'list' mode between tests so they don't contaminate each other.
  act(() => {
    setViewMode('list')
  })
})

describe('ViewSwitcher', () => {
  it('renders a single toggle button', () => {
    render(wrap(<ViewSwitcher />))
    expect(screen.getAllByRole('button')).toHaveLength(1)
    expect(screen.getByTestId('view-toggle')).toBeTruthy()
  })

  it('in list mode, offers the grid view', () => {
    render(wrap(<ViewSwitcher />))
    expect(screen.getByLabelText('a11y.gridView')).toBeTruthy()
    expect(screen.queryByLabelText('a11y.listView')).toBeNull()
  })

  it('tapping it in list mode switches to grid', () => {
    const { result } = renderHook(() => useViewMode())
    render(wrap(<ViewSwitcher />))

    fireEvent.press(screen.getByTestId('view-toggle'))

    expect(result.current.mode).toBe('grid')
  })

  it('in grid mode, offers the list view and switches back to it', () => {
    const { result } = renderHook(() => useViewMode())
    render(wrap(<ViewSwitcher />))

    fireEvent.press(screen.getByTestId('view-toggle'))
    expect(screen.getByLabelText('a11y.listView')).toBeTruthy()

    fireEvent.press(screen.getByTestId('view-toggle'))
    expect(result.current.mode).toBe('list')
    expect(screen.getByLabelText('a11y.gridView')).toBeTruthy()
  })
})
