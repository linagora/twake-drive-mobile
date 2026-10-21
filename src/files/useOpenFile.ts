import { useCallback } from 'react'
import { useClient } from 'cozy-client'
import { useRouter } from 'expo-router'

import { useWebEditor } from '@/viewer/useWebEditor'
import { DriveFile, openDriveFile, OpenDriveFileOptions } from './openDriveFile'

type OpenFile = (
  file: DriveFile,
  options?: Omit<OpenDriveFileOptions, 'openEditor'>
) => Promise<void>

/** The one way a screen opens a file. Throws on failure; the screen surfaces the error. */
export const useOpenFile = (): OpenFile => {
  const client = useClient()
  const router = useRouter()
  const openEditor = useWebEditor()
  return useCallback(
    async (file, options) => {
      if (!client) throw new Error('No cozy client')
      await openDriveFile(client, router, file, { ...options, openEditor })
    },
    [client, router, openEditor]
  )
}
