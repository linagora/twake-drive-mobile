import React from 'react'
import { Platform } from 'react-native'
import { Switch as PaperSwitch, useTheme } from 'react-native-paper'

type Props = React.ComponentProps<typeof PaperSwitch>

/**
 * Paper's switch, with an off track that shows on the dark theme: UISwitch
 * draws it in a translucent grey that melts into the dark surfaces, leaving
 * the knob alone.
 */
export const Switch = (props: Props): React.ReactElement => {
  const { dark, colors } = useTheme()
  const offTrack =
    dark && Platform.OS === 'ios' ? { ios_backgroundColor: colors.outline } : undefined
  return <PaperSwitch {...offTrack} {...props} />
}
