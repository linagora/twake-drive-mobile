/**
 * Collection options that route every call through
 * `/sharings/drives/<driveId>` instead of the instance's own `/files`.
 *
 * cozy-stack-client reads `driveId` in the collection constructor and builds
 * its path prefix from it, so scoping a write is a matter of passing this to
 * `client.collection()` — same shape twake-drive web uses in `lib/files.ts`.
 */
export const driveScope = (driveId?: string): { driveId?: string } => (driveId ? { driveId } : {})
