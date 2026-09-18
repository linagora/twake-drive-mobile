import { useCallback } from 'react'
import { useNavigation, useRouter } from 'expo-router'

/**
 * A back that stays inside the tab it is pressed in.
 *
 * `router.back()` walks the whole navigation history: at the root of a tab's
 * stack it bubbles up to the tab navigator and lands the user on whichever tab
 * they were on before, which is not what the arrow above a folder means. This
 * pops the tab's own stack, and returns to the tab's root when there is
 * nothing left to pop.
 */
export const useTabBack = (tabRoot: string): (() => void) => {
  const navigation = useNavigation()
  const router = useRouter()

  return useCallback(() => {
    if (navigation.canGoBack()) {
      navigation.goBack()
      return
    }
    router.replace(tabRoot as Parameters<typeof router.replace>[0])
  }, [navigation, router, tabRoot])
}
