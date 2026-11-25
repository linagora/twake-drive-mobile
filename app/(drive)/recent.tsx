import React from 'react'

import { useFlag } from '@/client/useFlag'
import { PersonalRecentsScreen } from '@/drive/PersonalRecentsScreen'
import { RecentFilesScreen } from '@/drive/RecentFilesScreen'

const RecentRoute = (): React.ReactElement => {
  const isPersonalRecentsEnabled = useFlag('drive.recents.enabled') === true
  return isPersonalRecentsEnabled ? <PersonalRecentsScreen /> : <RecentFilesScreen />
}

export default RecentRoute
