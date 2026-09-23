import { Q, useQuery } from 'cozy-client'

interface InstanceSettings {
  legal_notice_url?: string
  attributes?: { legal_notice_url?: string }
}

const instanceQuery = Q('io.cozy.settings').getById('io.cozy.settings.instance')

/**
 * Address of the legal notice the instance points at, the way the settings web
 * app reads it. Undefined when the instance names none.
 */
export const useLegalNoticeUrl = (): string | undefined => {
  const { data } = useQuery(instanceQuery, { as: 'io.cozy.settings/instance' })
  const doc = (Array.isArray(data) ? data[0] : data) as InstanceSettings | null | undefined
  return doc?.legal_notice_url ?? doc?.attributes?.legal_notice_url
}
