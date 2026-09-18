// Documents of a shared drive reach the screen from two places: the drive's
// own replica, where the fields sit at the top level, and the stack, where they
// sit under `attributes`. This normalises both into one shape.

export interface DriveChild {
  _id: string
  name: string
  type: 'file' | 'directory'
  size?: number | null
  mime?: string
  class?: string
  updated_at?: string
  path?: string
  cozyMetadata?: { createdBy?: { account?: string } }
  links?: { tiny?: string; small?: string; medium?: string; large?: string }
}

const toSize = (value: unknown): number | null => {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value !== '') {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

// A document read from the drive's replica has its fields at the top level; one
// read from the stack has them under `attributes`. Every field is taken from
// both, size included — it was only read from `attributes`, so a replicated
// file showed no size at all.
export const normalizeDriveChild = (raw: Record<string, unknown>): DriveChild => {
  const attrs = (raw.attributes ?? {}) as Record<string, unknown>
  const id = (raw._id ?? raw.id ?? '') as string
  const type = (attrs.type ?? raw.type ?? 'file') as 'file' | 'directory'
  return {
    _id: id,
    name: (attrs.name ?? raw.name ?? '') as string,
    type,
    size: toSize(attrs.size ?? raw.size),
    mime: (attrs.mime ?? raw.mime) as string | undefined,
    class: (attrs.class ?? raw.class) as string | undefined,
    updated_at: (attrs.updated_at ?? raw.updated_at) as string | undefined,
    path: (attrs.path ?? raw.path) as string | undefined,
    cozyMetadata: (attrs.cozyMetadata ?? raw.cozyMetadata) as DriveChild['cozyMetadata'],
    links: raw.links as DriveChild['links']
  }
}
