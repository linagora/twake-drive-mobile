import CozyClient, { useQuery } from 'cozy-client'

import { installedAppsQuery, installedAppsQueryAs } from './queries'

const APPS_MAX_AGE_MS = 5 * 60 * 1000

/** Whether an app is among the installed ones, apps being io.cozy.apps docs. */
export const isAppInstalled = (apps: unknown, slug: string): boolean =>
  Array.isArray(apps) && apps.some(app => (app as { slug?: string } | null)?.slug === slug)

/**
 * Whether the instance has the app of this slug installed, as twake-drive web
 * asks before offering an entry that lives in another app. False until the
 * apps are known. Offline the last list the store holds still answers, and a
 * refetch that fails leaves it in place.
 */
export const useIsAppInstalled = (slug: string): boolean => {
  const { data } = useQuery(installedAppsQuery(), {
    as: installedAppsQueryAs,
    fetchPolicy: CozyClient.fetchPolicies.olderThan(APPS_MAX_AGE_MS)
  })
  return isAppInstalled(data, slug)
}
