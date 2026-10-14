import type CozyClient from 'cozy-client'

import { getOnlineMonitor } from '@/network/OnlineMonitor'
import { setInstanceLocale } from '@/preferences/localePreference'

interface InstanceDoc {
  data?: { attributes?: { locale?: string } }
}

// The local replica of the instance settings has no locale, so the stack is
// asked directly. Offline or on failure the locale kept earlier stays.
export const refreshInstanceLocale = async (
  client?: CozyClient | null
): Promise<string | undefined> => {
  if (!client || !getOnlineMonitor().getCurrent()) return undefined
  try {
    const doc = (await client
      .getStackClient()
      .fetchJSON('GET', '/settings/instance')) as InstanceDoc
    const locale = doc.data?.attributes?.locale
    if (locale) setInstanceLocale(locale)
    return locale
  } catch (err) {
    console.warn('[refreshInstanceLocale] could not read the instance locale', err)
    return undefined
  }
}
