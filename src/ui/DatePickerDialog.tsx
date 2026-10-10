import React, { useEffect, useState } from 'react'
import { Pressable, StyleSheet, View } from 'react-native'
import { Button, Dialog, IconButton, Portal, Text, useTheme } from 'react-native-paper'
import {
  addDays,
  addMonths,
  endOfMonth,
  format,
  isBefore,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfWeek
} from 'date-fns'
import { useTranslation } from 'react-i18next'

import { dateLocaleForLanguage } from '@/i18n/dateLocale'

type WeekStart = 0 | 1 | 2 | 3 | 4 | 5 | 6

/** The weeks of the month `month` falls in, as rows of 7 days from `weekStartsOn`;
 *  a day outside the month is null. */
export const monthGrid = (month: Date, weekStartsOn: WeekStart): (Date | null)[][] => {
  const first = startOfMonth(month)
  const last = endOfMonth(month)
  const weeks: (Date | null)[][] = []
  let cursor = startOfWeek(first, { weekStartsOn })
  while (!isBefore(last, cursor)) {
    const week: (Date | null)[] = []
    for (let i = 0; i < 7; i++) {
      const day = addDays(cursor, i)
      week.push(day.getMonth() === first.getMonth() ? day : null)
    }
    weeks.push(week)
    cursor = addDays(cursor, 7)
  }
  return weeks
}

interface Props {
  visible: boolean
  /** The day already picked, if any. */
  value: Date | null
  /** The earliest day that can be picked. */
  minDate: Date
  title: string
  onDismiss: () => void
  onConfirm: (day: Date) => void
}

// Home-made rather than a library: native pickers need hand-done android/ios
// work, and pure-JS ones bring their own i18n and modal on top of react-native-paper.
export const DatePickerDialog = ({
  visible,
  value,
  minDate,
  title,
  onDismiss,
  onConfirm
}: Props) => {
  const { t, i18n } = useTranslation()
  const theme = useTheme()
  const locale = dateLocaleForLanguage(i18n.language)
  const weekStartsOn = (locale.options?.weekStartsOn ?? 0) as WeekStart
  const earliest = startOfDay(minDate)
  const [month, setMonth] = useState(() => startOfMonth(value ?? earliest))
  const [picked, setPicked] = useState<Date | null>(value)

  useEffect(() => {
    if (visible) {
      setMonth(startOfMonth(value ?? earliest))
      setPicked(value)
    }
    // Reopening starts from the saved value, not from where a dismissed pick left off.
  }, [visible])

  const weeks = monthGrid(month, weekStartsOn)
  const weekdays = weeks[0].map((_, i) =>
    format(addDays(startOfWeek(month, { weekStartsOn }), i), 'EEEEE', { locale })
  )
  const canGoBack = isBefore(earliest, month)

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss}>
        <Dialog.Title>{title}</Dialog.Title>
        <Dialog.Content>
          <View style={styles.header}>
            <IconButton
              icon="chevron-left"
              testID="date-picker-prev"
              disabled={!canGoBack}
              onPress={() => setMonth(m => addMonths(m, -1))}
              accessibilityLabel={t('drive.share.linkExpiryPrevMonth')}
            />
            <Text variant="titleMedium" testID="date-picker-month" accessibilityLiveRegion="polite">
              {format(month, 'LLLL yyyy', { locale })}
            </Text>
            <IconButton
              icon="chevron-right"
              testID="date-picker-next"
              onPress={() => setMonth(m => addMonths(m, 1))}
              accessibilityLabel={t('drive.share.linkExpiryNextMonth')}
            />
          </View>
          <View
            style={styles.week}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            {weekdays.map((label, i) => (
              <Text key={i} variant="labelSmall" style={styles.cell}>
                {label}
              </Text>
            ))}
          </View>
          {weeks.map((week, w) => (
            <View key={w} style={styles.week}>
              {week.map((day, d) => {
                if (!day) return <View key={d} style={styles.cell} />
                const disabled = isBefore(day, earliest)
                const selected = picked !== null && isSameDay(day, picked)
                return (
                  <Pressable
                    key={d}
                    testID={`date-picker-day-${format(day, 'yyyy-MM-dd')}`}
                    accessibilityRole="button"
                    accessibilityLabel={format(day, 'PPPP', { locale })}
                    accessibilityState={{ disabled, selected }}
                    disabled={disabled}
                    onPress={() => setPicked(day)}
                    style={[
                      styles.cell,
                      styles.day,
                      selected && { backgroundColor: theme.colors.primary }
                    ]}
                  >
                    <Text
                      variant="bodyMedium"
                      style={{
                        color: selected
                          ? theme.colors.onPrimary
                          : disabled
                            ? theme.colors.onSurfaceDisabled
                            : theme.colors.onSurface
                      }}
                    >
                      {day.getDate()}
                    </Text>
                  </Pressable>
                )
              })}
            </View>
          ))}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss}>{t('common.cancel')}</Button>
          <Button
            mode="contained"
            testID="date-picker-confirm"
            disabled={!picked || isBefore(picked, earliest)}
            onPress={() => picked && onConfirm(picked)}
          >
            {t('common.confirm')}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  )
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  week: { flexDirection: 'row' },
  cell: { flex: 1, textAlign: 'center', alignItems: 'center', justifyContent: 'center' },
  day: { aspectRatio: 1, borderRadius: 999 }
})
