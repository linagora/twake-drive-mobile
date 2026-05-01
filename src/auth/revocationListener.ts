import CozyClient from 'cozy-client'

export const attachRevocationListener = (
  client: CozyClient,
  onRevoke: () => void
): (() => void) => {
  const handler = () => onRevoke()
  client.on('revoked', handler)
  return () => client.removeListener('revoked', handler)
}
