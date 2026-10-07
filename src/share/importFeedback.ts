import type CozyClient from 'cozy-client'
import type { TFunction } from 'i18next'

import { optimisticFiles } from '@/files/optimisticFiles'
import { optimisticCreated } from '@/files/optimisticCreated'
import type { BatchResult } from './uploadBatch'

/**
 * Pushes the files a batch just uploaded into the store, so the folder shows
 * them before the periodic replication brings the server's copy.
 */
export const optimisticUploaded = (client: CozyClient, res: BatchResult, dirId: string): void => {
  optimisticFiles(
    client,
    res.results
      .map(r => r.file)
      .filter((f): f is { _id: string; name: string } => !!f)
      .map(f => optimisticCreated(f, dirId, 'file'))
  )
}

/** The one-line outcome of a batch, as shown in a snackbar. */
export const batchMessage = (t: TFunction, res: BatchResult): string => {
  if (res.failed > 0 && res.succeeded > 0) {
    return t('drive.import.partial', {
      succeeded: res.succeeded,
      total: res.results.length,
      failed: res.failed
    })
  }
  if (res.failed > 0) return t('drive.import.errorGeneric')
  return res.succeeded > 1
    ? t('drive.import.successBulk', { count: res.succeeded })
    : t('drive.import.successFile')
}
