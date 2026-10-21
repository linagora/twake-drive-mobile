import React from 'react'
import { StackActions } from '@react-navigation/native'
import { useNavigationContainerRef, useRouter } from 'expo-router'
import { useTranslation } from 'react-i18next'

import { DRIVE_HOME } from '@/auth/enterDrive'
import { ErrorState } from '@/ui/ErrorState'

interface RouteNode {
  name: string
  state?: { key?: string; routes: RouteNode[] }
}

const findRoute = (state: RouteNode['state'] | undefined, name: string): RouteNode | undefined => {
  for (const route of state?.routes ?? []) {
    if (route.name === name) return route
    const found = findRoute(route.state, name)
    if (found) return found
  }
  return undefined
}

export default function NotFound() {
  const { t } = useTranslation()
  const router = useRouter()
  const navigationRef = useNavigationContainerRef()

  const backToDrive = (): void => {
    // Every folder of the Mon Drive tab is the same route, so dismissTo alone
    // stops on the one left open. Empty the tab's stack first, as a tap on the
    // tab does.
    const files = findRoute(
      findRoute(navigationRef.getRootState(), '(drive)')?.state,
      'files'
    )?.state
    if (files?.key && files.routes.length > 1) {
      navigationRef.dispatch({ ...StackActions.popToTop(), target: files.key })
    }
    router.dismissTo(DRIVE_HOME)
  }

  return (
    <ErrorState
      message={t('errors.linkNotFound')}
      retryLabel={t('errors.backToDrive')}
      onRetry={backToDrive}
    />
  )
}
