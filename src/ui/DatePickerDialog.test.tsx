import React from 'react'
import { Provider as PaperProvider } from 'react-native-paper'
import { fireEvent, render, screen } from '@testing-library/react-native'

jest.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { language: 'en' } })
}))

import { DatePickerDialog, monthGrid } from './DatePickerDialog'

describe('monthGrid', () => {
  it('lays a month out in weeks of 7 starting on the given day', () => {
    // May 2030 starts on a Wednesday and has 31 days.
    const sunday = monthGrid(new Date(2030, 4, 15), 0)
    expect(sunday.every(week => week.length === 7)).toBe(true)
    expect(sunday[0].findIndex(d => d !== null)).toBe(3)
    expect(sunday.flat().filter(Boolean)).toHaveLength(31)
    const monday = monthGrid(new Date(2030, 4, 15), 1)
    expect(monday[0].findIndex(d => d !== null)).toBe(2)
  })
})

describe('DatePickerDialog', () => {
  const setup = (value: Date | null = null) => {
    const onConfirm = jest.fn()
    const onDismiss = jest.fn()
    render(
      <PaperProvider>
        <DatePickerDialog
          visible
          title="Deadline"
          value={value}
          minDate={new Date(2030, 4, 10, 15)}
          onConfirm={onConfirm}
          onDismiss={onDismiss}
        />
      </PaperProvider>
    )
    return { onConfirm, onDismiss }
  }

  it('opens on the month of the saved value', () => {
    setup(new Date(2030, 6, 4))
    expect(screen.getByTestId('date-picker-month')).toHaveTextContent('July 2030')
  })

  it('disables the days before the minimum, keeps that day itself', () => {
    setup()
    expect(screen.getByTestId('date-picker-day-2030-05-09')).toBeDisabled()
    expect(screen.getByTestId('date-picker-day-2030-05-10')).toBeEnabled()
  })

  it('does not go back before the month of the minimum', () => {
    setup()
    expect(screen.getByTestId('date-picker-prev')).toBeDisabled()
    fireEvent.press(screen.getByTestId('date-picker-next'))
    expect(screen.getByTestId('date-picker-month')).toHaveTextContent('June 2030')
    expect(screen.getByTestId('date-picker-prev')).toBeEnabled()
  })

  it('confirms only once a day is picked', () => {
    const { onConfirm } = setup()
    expect(screen.getByTestId('date-picker-confirm')).toBeDisabled()
    fireEvent.press(screen.getByTestId('date-picker-day-2030-05-20'))
    fireEvent.press(screen.getByTestId('date-picker-confirm'))
    expect(onConfirm).toHaveBeenCalledWith(new Date(2030, 4, 20))
  })

  it('keeps Confirm disabled when the saved day is already past', () => {
    setup(new Date(2030, 4, 2))
    expect(screen.getByTestId('date-picker-confirm')).toBeDisabled()
  })

  it('announces the month change and hides the weekday letters from screen readers', () => {
    setup()
    expect(screen.getByTestId('date-picker-month').props.accessibilityLiveRegion).toBe('polite')
    expect(screen.getAllByText('S', { includeHiddenElements: true })).toHaveLength(2)
    expect(screen.queryAllByText('S')).toHaveLength(0)
  })

  it('ignores a press on a day that is not allowed', () => {
    setup()
    fireEvent.press(screen.getByTestId('date-picker-day-2030-05-09'))
    expect(screen.getByTestId('date-picker-confirm')).toBeDisabled()
  })
})
