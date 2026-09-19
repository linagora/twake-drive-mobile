interface OwnedDocument {
  cozyMetadata?: { createdOn?: string }
}

interface CurrentUser {
  name?: string
  email?: string
}

const hostOf = (uri: string | undefined): string | undefined => {
  if (!uri) return undefined
  try {
    return new URL(uri).host
  } catch {
    return undefined
  }
}

/**
 * Who a document belongs to: the user for anything created on their own
 * instance, and the instance a shared document came from otherwise.
 */
export const fileOwnerLabel = (
  file: OwnedDocument | null | undefined,
  user: CurrentUser,
  stackUri: string | undefined
): string | null => {
  const origin = hostOf(file?.cozyMetadata?.createdOn)
  if (origin && origin !== hostOf(stackUri)) return origin
  return user.name ?? user.email ?? null
}
