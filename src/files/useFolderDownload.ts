import { useRef } from 'react'
import { useClient } from 'cozy-client'
import { useTranslation } from 'react-i18next'

import { useIsOnline } from '@/network/useIsOnline'
import { requireOnline } from '@/network/requireOnline'
import { downloadFolder, DownloadCancelledError } from './download'

/**
 * Hands a folder to the system as a zip. The stack builds the archive, which
 * takes a while on a big folder, so the user is told it is under way and a
 * second tap is ignored until the first one is over.
 */
export const useFolderDownload = (
  screen: string,
  notify: (message: string) => void
): ((folder: { _id: string; name: string }) => void) => {
  const { t } = useTranslation()
  const client = useClient()
  const isOnline = useIsOnline()
  const running = useRef(false)

  return folder => {
    if (!requireOnline(isOnline, notify, t)) return
    if (!client || running.current) return
    running.current = true
    notify(t('drive.folderZipPreparing'))
    void downloadFolder(client, folder)
      .then(outcome => {
        if (outcome === 'queued') notify(t('drive.folderZipStarted'))
      })
      .catch(e => {
        if (e instanceof DownloadCancelledError) return
        console.error(`[${screen}] folder download failed`, e)
        notify(t('errors.generic'))
      })
      .finally(() => {
        running.current = false
      })
  }
}
