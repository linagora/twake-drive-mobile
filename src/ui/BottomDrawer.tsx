import React, { useCallback, useEffect, useRef, useState } from 'react'
import {
  AccessibilityInfo,
  Animated,
  Dimensions,
  Easing,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  findNodeHandle
} from 'react-native'
import { Text, useTheme } from 'react-native-paper'
import { useTranslation } from 'react-i18next'
import { useSafeAreaInsets } from 'react-native-safe-area-context'

import { CozyIcon } from '@/ui/icons/CozyIcon'

/** Side of the square an item icon sits in (cozy-ui ListItemIcon). */
const ICON_BOX = 32
/** Side of the glyph drawn inside that square. */
const ICON_SIZE = 20
const OPEN_MS = 220
const CLOSE_MS = 180
/** A drag further than this, or a faster flick, dismisses the drawer. */
const DISMISS_DISTANCE = 80
const DISMISS_VELOCITY = 0.8
const MAX_HEIGHT_RATIO = 0.85

interface DrawerProps {
  visible: boolean
  onClose: () => void
  /** Called once the closing animation is over and the sheet is gone: the moment
   *  to open anything that would otherwise be presented over a dismissing modal. */
  onDismissed?: () => void
  /** Header title, usually the name of the document the actions apply to. */
  title?: string
  /** Header leading visual, usually the icon or thumbnail of that document. */
  headerIcon?: React.ReactNode
  children: React.ReactNode
  testID?: string
}

/**
 * Bottom sheet that slides up over the screen: drag handle, optional header,
 * then its content. Tapping the backdrop, dragging the sheet down or the
 * Android back button close it. Built on the RN `Modal` so it needs no native
 * dependency and works the same on both platforms.
 */
export const BottomDrawer = ({
  visible,
  onClose,
  onDismissed,
  title,
  headerIcon,
  children,
  testID = 'bottom-drawer'
}: DrawerProps): React.ReactElement | null => {
  const { t } = useTranslation()
  const theme = useTheme()
  const insets = useSafeAreaInsets()
  const windowHeight = Dimensions.get('window').height
  // The Modal stays mounted while the closing animation plays.
  const [mounted, setMounted] = useState(visible)
  const progress = useRef(new Animated.Value(visible ? 1 : 0)).current
  const drag = useRef(new Animated.Value(0)).current
  const headerRef = useRef<View>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const onDismissedRef = useRef(onDismissed)
  onDismissedRef.current = onDismissed
  const wasOpen = useRef(visible)

  useEffect(() => {
    if (visible) {
      wasOpen.current = true
      setMounted(true)
      drag.setValue(0)
      Animated.timing(progress, {
        toValue: 1,
        duration: OPEN_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true
      }).start()
      const timer = setTimeout(() => {
        const handle = headerRef.current ? findNodeHandle(headerRef.current) : null
        if (handle) AccessibilityInfo.setAccessibilityFocus(handle)
      }, OPEN_MS)
      return () => clearTimeout(timer)
    }
    if (!wasOpen.current) return undefined
    wasOpen.current = false
    Animated.timing(progress, {
      toValue: 0,
      duration: CLOSE_MS,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true
    }).start(({ finished }) => {
      if (!finished) return
      setMounted(false)
      onDismissedRef.current?.()
    })
    return undefined
  }, [visible, progress, drag])

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_e, g) => drag.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DISTANCE || g.vy > DISMISS_VELOCITY) {
          onCloseRef.current()
          return
        }
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start()
      },
      onPanResponderTerminate: () => {
        Animated.spring(drag, { toValue: 0, useNativeDriver: true }).start()
      }
    })
  ).current

  const handleClose = useCallback(() => onCloseRef.current(), [])

  if (!mounted) return null

  const translateY = Animated.add(
    progress.interpolate({ inputRange: [0, 1], outputRange: [windowHeight, 0] }),
    drag
  )

  return (
    <Modal
      transparent
      visible
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={handleClose}
      testID={testID}
    >
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t('a11y.closeActions')}
            testID={`${testID}-backdrop`}
          />
        </Animated.View>
        <Animated.View
          accessibilityViewIsModal
          testID={`${testID}-sheet`}
          style={[
            styles.sheet,
            {
              backgroundColor: theme.colors.surface,
              maxHeight: windowHeight * MAX_HEIGHT_RATIO,
              paddingBottom: Math.max(insets.bottom, 8),
              transform: [{ translateY }]
            }
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.grab} testID={`${testID}-handle`}>
            <View style={[styles.handle, { backgroundColor: theme.colors.outlineVariant }]} />
            {title ? (
              <View
                ref={headerRef}
                accessible
                accessibilityRole="header"
                style={styles.header}
                testID={`${testID}-header`}
              >
                {headerIcon ? <View style={styles.headerIcon}>{headerIcon}</View> : null}
                <Text variant="titleMedium" numberOfLines={1} style={styles.headerTitle}>
                  {title}
                </Text>
              </View>
            ) : null}
          </View>
          <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  )
}

interface ItemProps {
  label: string
  /** Name of a `CozyIcon`. */
  icon: string
  onPress: () => void
  disabled?: boolean
  /** Tint the row with the error colour (leaving, deleting for good). */
  destructive?: boolean
  testID?: string
}

/** One action of a {@link BottomDrawer}: a 32pt icon box then a label. */
export const BottomDrawerItem = ({
  label,
  icon,
  onPress,
  disabled = false,
  destructive = false,
  testID
}: ItemProps): React.ReactElement => {
  const theme = useTheme()
  const color = destructive ? theme.colors.error : theme.colors.onSurface
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      android_ripple={
        Platform.OS === 'android' ? { color: theme.colors.surfaceVariant } : undefined
      }
      style={({ pressed }) => [
        styles.item,
        disabled && styles.itemDisabled,
        pressed && { backgroundColor: theme.colors.surfaceVariant }
      ]}
      testID={testID}
    >
      <View style={styles.itemIcon}>
        <CozyIcon name={icon} size={ICON_SIZE} color={color} />
      </View>
      <Text variant="bodyLarge" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { borderTopLeftRadius: 16, borderTopRightRadius: 16, overflow: 'hidden' },
  grab: { paddingTop: 8 },
  handle: { alignSelf: 'center', width: 32, height: 4, borderRadius: 2, marginBottom: 8 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 12
  },
  headerIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { flex: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 16,
    gap: 12
  },
  itemDisabled: { opacity: 0.38 },
  itemIcon: { width: ICON_BOX, height: ICON_BOX, alignItems: 'center', justifyContent: 'center' }
})
