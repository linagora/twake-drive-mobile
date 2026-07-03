import React from 'react'
import { StyleSheet, View } from 'react-native'
import { Appbar } from 'react-native-paper'
import { TwakeLogo } from '@/ui/icons/TwakeLogo'
import { CozyIcon } from '@/ui/icons/CozyIcon'

interface Props {
  title: string
  onBack: () => void
  onShare?: () => void
}

/** Header for full-screen editor routes: a back action to return to the drive,
 *  the Twake logo, the document title, and an optional share action on the right.
 *  Paper's Appbar.Header applies the device status-bar inset, so the phone
 *  clock/icons stay visible above it. */
export const EditorHeader = ({ title, onBack, onShare }: Props): React.ReactElement => (
  <Appbar.Header>
    <Appbar.BackAction onPress={onBack} />
    <View style={styles.logo}>
      <TwakeLogo size={28} />
    </View>
    <Appbar.Content title={title} />
    {onShare ? (
      <Appbar.Action
        icon={p => <CozyIcon name="shareExternal" size={p?.size ?? 24} color={p?.color} />}
        onPress={onShare}
        accessibilityLabel="Partager"
      />
    ) : null}
  </Appbar.Header>
)

const styles = StyleSheet.create({
  logo: { marginLeft: 4, marginRight: 4, justifyContent: 'center' }
})
