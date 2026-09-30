import { Q, useQuery } from 'cozy-client'

interface InstanceSettings {
  tos?: string
  attributes?: { tos?: string }
}

const instanceQuery = Q('io.cozy.settings').getById('io.cozy.settings.instance')

export const TWAKE_TOS_URL = 'https://twake.app/en/terms-of-use/'

/**
 * Address of the revision the instance pins, built the way the settings web app
 * builds it. Twake's public terms of use when the instance pins none.
 */
export const makeTosUrl = (tos?: string): string =>
  tos ? `https://files.cozycloud.cc/TOS-${tos}.pdf` : TWAKE_TOS_URL

/** Address of the terms of service to show. Always answers one. */
export const useTosUrl = (): string => {
  const { data } = useQuery(instanceQuery, { as: 'io.cozy.settings/instance' })
  const doc = (Array.isArray(data) ? data[0] : data) as InstanceSettings | null | undefined
  return makeTosUrl(doc?.tos ?? doc?.attributes?.tos)
}
