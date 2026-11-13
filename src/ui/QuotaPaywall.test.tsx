import React from 'react'
import { Linking } from 'react-native'
import { act, fireEvent, render } from '@testing-library/react-native'
import { Provider as PaperProvider } from 'react-native-paper'

import i18n from '@/i18n'
import { QuotaPaywall } from './QuotaPaywall'

let mockInfo: object
jest.mock('cozy-client', () => ({
  ...jest.requireActual('cozy-client'),
  useInstanceInfo: () => mockInfo
}))

const infoWith = (context: object, isLoaded = true): object => ({
  isLoaded,
  instance: { data: { uuid: 'abc', locale: 'fr' } },
  context: { data: context },
  diskUsage: { data: {} }
})

const renderPaywall = (onClose = jest.fn()): ReturnType<typeof render> =>
  render(
    <PaperProvider>
      <QuotaPaywall onClose={onClose} />
    </PaperProvider>
  )

it('tells about the plans where the instance offers them, and only closes', () => {
  const openURL = jest.spyOn(Linking, 'openURL')
  mockInfo = infoWith({ enable_premium_links: true, manager_url: 'https://manager.example' })
  const onClose = jest.fn()
  const screen = renderPaywall(onClose)
  screen.getByText(i18n.t('backup.paywall.premiumTitle'))
  fireEvent.press(screen.getByText(i18n.t('backup.paywall.understood')))
  expect(onClose).toHaveBeenCalled()
  expect(openURL).not.toHaveBeenCalled()
  openURL.mockRestore()
})

it('only says the Drive is full where no plan is offered', () => {
  mockInfo = infoWith({ enable_premium_links: false })
  renderPaywall().getByText(i18n.t('backup.paywall.defaultTitle'))
  mockInfo = infoWith({ enable_premium_links: true })
  renderPaywall().getByText(i18n.t('backup.paywall.defaultTitle'))
})

it('waits for the instance, a while at most', () => {
  jest.useFakeTimers()
  mockInfo = infoWith({}, false)
  const screen = renderPaywall()
  expect(screen.queryByText(i18n.t('backup.paywall.understood'))).toBeNull()
  act(() => jest.advanceTimersByTime(3000))
  screen.getByText(i18n.t('backup.paywall.understood'))
  jest.useRealTimers()
})
