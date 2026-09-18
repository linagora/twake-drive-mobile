import React from 'react'

import { SharedDriveScreen } from '@/drive/SharedDriveScreen'

// Mounted inside the shares tab so browsing a drive stays on that tab's stack:
// leaving it with the back button lands back on the shares list, not on
// whatever the drive tab was showing.
export default function SharedDriveRoute() {
  return <SharedDriveScreen basePath="/(drive)/shared/drive" />
}
