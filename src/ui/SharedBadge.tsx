import React from 'react'
import { StyleSheet, View } from 'react-native'
import twakePalette from '@linagora/twake-css/palette.json'
import { CozyIcon } from '@/ui/icons/CozyIcon'

import { FileSharingStatus } from '@/sharing/SharingProvider'

interface Props {
  status: FileSharingStatus | null
  /** Diameter of the green badge. */
  size?: number
}

/**
 * Small green sharing badge overlaid on a file/folder thumbnail when the
 * file has any active sharing or public link. Mirrors twake-drive web's
 * shared badge (cozy-ui `ShareCircle`, success green).
 *
 * Returns null when `status` is null or the file isn't shared — callers
 * can unconditionally render it inside a thumbnail wrapper without an
 * extra branch.
 */
export const SharedBadge = ({ status, size = 16 }: Props) => {
  if (!status?.isShared) return null
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2 }]}>
      <CozyIcon name="shareCircle" size={size} color={twakePalette.Success[600]} />
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    backgroundColor: twakePalette.Common.white
  }
})
