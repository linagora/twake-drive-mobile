interface CreatedDoc {
  _id: string
  name?: string | null
  updated_at?: string
  created_at?: string
}

type OptimisticDoc = { _id: string } & Record<string, unknown>

/**
 * The document to write into the store for something just created.
 *
 * The folder lists select on the attribute they sort by — `name` or
 * `updated_at` — so a document missing it is filtered out by cozy-client and
 * the new row only appears when the replication brings the server's copy.
 */
export const optimisticCreated = (
  created: CreatedDoc,
  dirId: string,
  type: 'directory' | 'file',
  now: () => string = () => new Date().toISOString()
): OptimisticDoc => {
  const stamp = created.updated_at ?? created.created_at ?? now()
  return {
    ...created,
    name: created.name ?? '',
    dir_id: dirId,
    type,
    _type: 'io.cozy.files',
    created_at: created.created_at ?? stamp,
    updated_at: created.updated_at ?? stamp
  }
}
