import React from 'react'
import { Animated, Platform, Pressable, StatusBar, StyleSheet, View } from 'react-native'
import { Appbar, Text, useTheme } from 'react-native-paper'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTranslation } from 'react-i18next'

import { CozyIcon } from '@/ui/icons/CozyIcon'
import { cozyTokens } from '@/ui/theme'
import { useAutoHidingChrome } from './useAutoHidingChrome'

/**
 * How a document screen is framed.
 *
 * - `immersive`: the document takes the whole dark canvas, the name, the way
 *   back and the actions floating over it.
 * - `player`: the same bar, hiding itself the same way, but with its room kept
 *   clear of the document. For a document that draws controls of its own: two
 *   layers sharing the same band fight, whoever is on top.
 * - `editor`: the web editor draws its own header inside, so the native bar
 *   stays down to the way back.
 */
export type DocumentChrome = 'immersive' | 'player' | 'editor'

export interface DocumentAction {
  icon: string
  label: string
  onPress: () => void
  disabled?: boolean
  testID?: string
}

interface CommonProps {
  onBack: () => void
  children: React.ReactNode
  /** Shown next to the name, on the chromes that have room for them. */
  actions?: DocumentAction[]
}

/** The editor chrome shows no title, so those routes do not have to know one. */
type Props =
  | (CommonProps & { chrome?: 'immersive' | 'player'; title: string })
  | (CommonProps & { chrome: 'editor'; title?: string })

export const DOCUMENT_BACK_TEST_ID = 'document-back-button'
export const DOCUMENT_CONTENT_TEST_ID = 'document-content'
export const DOCUMENT_CHROME_TEST_ID = 'document-chrome'

/** Height of the bar's controls, the room the `player` chrome keeps for it. */
const CHROME_BAR_HEIGHT = 40

export const DocumentScreen = ({
  title,
  onBack,
  chrome = 'immersive',
  actions,
  children
}: Props): React.ReactElement => {
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const { t } = useTranslation()
  const { visible, opacity, reveal } = useAutoHidingChrome()
  const androidTopInset = Platform.OS === 'ios' ? 0 : insets.top || StatusBar.currentHeight || 0
  const barTopInset = Platform.OS === 'ios' ? 0 : insets.top

  if (chrome === 'immersive' || chrome === 'player') {
    const barTop = barTopInset + cozyTokens.spacing.sm
    // `player` keeps the document out from under the bar rather than out of
    // its way: the room stays reserved, so nothing moves when the bar fades.
    const contentTop =
      chrome === 'player' ? barTop + CHROME_BAR_HEIGHT + cozyTokens.spacing.sm : androidTopInset
    const bar = (
      <Animated.View
        testID={DOCUMENT_CHROME_TEST_ID}
        style={[styles.bar, styles.floatingBar, { top: barTop, opacity }]}
        pointerEvents={visible ? 'box-none' : 'none'}
      >
        <Pressable
          onPress={onBack}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          testID={DOCUMENT_BACK_TEST_ID}
          hitSlop={cozyTokens.spacing.sm}
          style={styles.floatingControl}
        >
          <CozyIcon name="previous" size={cozyTokens.iconSize.md} color={cozyTokens.canvas.on} />
        </Pressable>
        <Text style={styles.floatingTitle} numberOfLines={1}>
          {title}
        </Text>
        {(actions ?? []).map(action => (
          <Pressable
            key={action.icon}
            onPress={action.onPress}
            disabled={action.disabled}
            accessibilityRole="button"
            accessibilityLabel={action.label}
            accessibilityState={{ disabled: !!action.disabled }}
            testID={action.testID}
            hitSlop={cozyTokens.spacing.sm}
            style={[styles.floatingControl, action.disabled && styles.disabled]}
          >
            <CozyIcon
              name={action.icon}
              size={cozyTokens.iconSize.md}
              color={cozyTokens.canvas.on}
            />
          </Pressable>
        ))}
      </Animated.View>
    )

    return (
      <View style={[styles.screen, styles.canvas]}>
        <View
          testID={DOCUMENT_CONTENT_TEST_ID}
          style={[styles.screen, { paddingTop: contentTop }]}
          onStartShouldSetResponderCapture={() => {
            reveal()
            return false
          }}
        >
          {children}
        </View>
        {bar}
      </View>
    )
  }

  return (
    <View style={[styles.screen, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header statusBarHeight={androidTopInset} elevated={false} mode="small">
        <Appbar.Action
          isLeading
          animated={false}
          icon={p => (
            <CozyIcon
              name="previous"
              size={p?.size ?? cozyTokens.iconSize.md}
              color={theme.colors.onSurface}
            />
          )}
          onPress={onBack}
          accessibilityLabel={t('common.back')}
          testID={DOCUMENT_BACK_TEST_ID}
        />
      </Appbar.Header>
      {children}
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  canvas: { backgroundColor: cozyTokens.canvas.background },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cozyTokens.spacing.sm
  },
  floatingBar: {
    position: 'absolute',
    left: cozyTokens.spacing.sm,
    right: cozyTokens.spacing.sm,
    zIndex: cozyTokens.zIndex.chrome
  },

  floatingControl: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: cozyTokens.canvas.control
  },
  disabled: { opacity: 0.4 },
  floatingTitle: {
    flex: 1,
    color: cozyTokens.canvas.on,
    fontSize: 15,
    paddingVertical: cozyTokens.spacing.xs,
    paddingHorizontal: cozyTokens.spacing.sm,
    borderRadius: cozyTokens.radius.md,
    backgroundColor: cozyTokens.canvas.control
  }
})
