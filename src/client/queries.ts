import { Q, QueryDefinition } from 'cozy-client'

export const ROOT_DIR_ID = 'io.cozy.files.root-dir'
export const TRASH_DIR_ID = 'io.cozy.files.trash-dir'

export interface FileQueryResult {
  _id: string
  _type: string
  name: string
  type: 'file' | 'directory'
  dir_id?: string
  size?: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: {
    createdBy?: { account?: string }
  }
  links?: {
    tiny?: string
    small?: string
    medium?: string
    large?: string
  }
}

export const folderContentsQuery = (dirId: string): QueryDefinition =>
  Q('io.cozy.files')
    .where({ dir_id: dirId })
    .sortBy([{ type: 'asc' }, { name: 'asc' }])

export const folderContentsQueryAs = (dirId: string): string => `io.cozy.files/dir/${dirId}`

export interface SharingRule {
  title: string
  doctype: string
  values: string[]
}

export interface SharingQueryResult {
  _id: string
  _type: string
  attributes: {
    description?: string
    owner?: boolean
    rules?: SharingRule[]
    members?: unknown[]
  }
}

export const sharedWithMeQuery = (): QueryDefinition =>
  Q('io.cozy.sharings').where({ owner: false })
export const sharedWithMeQueryAs = 'io.cozy.sharings/with-me'

export const recentQuery = (): QueryDefinition =>
  Q('io.cozy.files')
    .where({ type: 'file', trashed: false })
    .sortBy([{ updated_at: 'desc' }])
    .limitBy(50)
export const recentQueryAs = 'io.cozy.files/recent'

export const trashQuery = (): QueryDefinition => Q('io.cozy.files').where({ dir_id: TRASH_DIR_ID })
export const trashQueryAs = 'io.cozy.files/trash'

export const fileByIdQuery = (id: string): QueryDefinition => Q('io.cozy.files').getById(id)
export const fileByIdQueryAs = (id: string): string => `io.cozy.files/${id}`

export const filesByIdsQuery = (ids: string[]): QueryDefinition =>
  Q('io.cozy.files').getByIds(ids).sortBy([{ type: 'asc' }, { name: 'asc' }])
export const filesByIdsQueryAs = (ids: string[]): string =>
  `io.cozy.files/byIds/${ids.join('-')}`
