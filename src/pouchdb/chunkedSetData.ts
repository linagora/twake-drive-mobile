const CHUNK_SIZE = 250

const yieldToEventLoop = (): Promise<void> => new Promise(resolve => setImmediate(resolve))

interface Chunkable {
  setData?: unknown
  __chunkedSetData?: boolean
}

export const installChunkedSetData = (client: Chunkable): void => {
  if (!client || client.__chunkedSetData || typeof client.setData !== 'function') return
  const original = client.setData.bind(client) as (data: Record<string, unknown[]>) => unknown
  client.setData = (data: Record<string, unknown[]>): unknown => {
    const entries = Object.entries(data ?? {})
    const total = entries.reduce((n, [, docs]) => n + (Array.isArray(docs) ? docs.length : 0), 0)
    if (total <= CHUNK_SIZE) return original(data)
    void (async () => {
      for (const [doctype, docs] of entries) {
        if (!Array.isArray(docs) || docs.length <= CHUNK_SIZE) {
          original({ [doctype]: docs })
          await yieldToEventLoop()
          continue
        }
        for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
          original({ [doctype]: docs.slice(i, i + CHUNK_SIZE) })
          await yieldToEventLoop()
        }
      }
    })()
    return undefined
  }
  client.__chunkedSetData = true
}
