import type CozyClient from 'cozy-client'
import { triggerPouchReplication } from '@/pouchdb/triggerReplication'
import { uploadSharedFile, SharedItem, UploadedFile } from '@/files/uploadSharedFile'

export interface BatchItemResult {
  item: SharedItem
  ok: boolean
  file?: UploadedFile
  error?: string
}
export interface BatchResult {
  results: BatchItemResult[]
  succeeded: number
  failed: number
}
export type BatchProgress = (done: number, total: number, currentFraction: number) => void

export const uploadBatch = async (
  client: CozyClient,
  items: SharedItem[],
  dirId: string,
  onProgress?: BatchProgress
): Promise<BatchResult> => {
  const results: BatchItemResult[] = []
  let succeeded = 0
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    try {
      const file = await uploadSharedFile(client, item, dirId, frac =>
        onProgress?.(i, items.length, frac)
      )
      results.push({ item, ok: true, file })
      succeeded++
    } catch (e) {
      results.push({ item, ok: false, error: e instanceof Error ? e.message : String(e) })
    }
  }
  if (succeeded > 0) triggerPouchReplication(client, 'io.cozy.files')
  onProgress?.(items.length, items.length, 1)
  return { results, succeeded, failed: results.length - succeeded }
}
