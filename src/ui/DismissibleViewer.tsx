import React from 'react'
import { StyleSheet, ViewStyle } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

const DISMISS_TRANSLATION_PX = 150
const DISMISS_VELOCITY = 800

interface Props {
  onDismiss: () => void
  children: React.ReactNode
  style?: ViewStyle
}

/**
 * Vertical drag-to-dismiss wrapper that doesn't interfere with horizontal
 * gestures inside its content (so AVPlayer scrubbing still works through
 * it). Drives an animated backdrop fade + content scale-down to give the
 * modal-close feel.
 *
 * For zoom + pan use ZoomableImage instead; this wrapper is for content
 * that brings its own gesture handling (video, PDF, etc.).
 */
export const DismissibleViewer = ({ onDismiss, children, style }: Props): React.ReactElement => {
  const translateY = useSharedValue(0)

  const pan = Gesture.Pan()
    // Don't compete with taps or short jitters.
    .minDistance(20)
    // Activate only on a downward drag.
    .activeOffsetY([10, 999])
    // Stay out of horizontal gestures (AVPlayer scrubbing, PDF horizontal
    // pan, etc.) by failing as soon as the user moves sideways.
    .failOffsetX([-30, 30])
    .onUpdate(e => {
      // Don't follow upward drags.
      translateY.value = Math.max(0, e.translationY)
    })
    .onEnd(e => {
      const dismiss =
        Math.abs(e.translationY) > DISMISS_TRANSLATION_PX ||
        e.velocityY > DISMISS_VELOCITY
      if (dismiss) {
        runOnJS(onDismiss)()
      } else {
        translateY.value = withSpring(0)
      }
    })

  const dragProgress = useDerivedValue(() => {
    const ratio = translateY.value / DISMISS_TRANSLATION_PX
    return ratio > 1 ? 1 : ratio
  })

  const backdropStyle = useAnimatedStyle(() => ({
    backgroundColor: `rgba(0,0,0,${1 - dragProgress.value})`
  }))

  const transformStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: 1 - 0.15 * dragProgress.value }
    ]
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[StyleSheet.absoluteFill, backdropStyle]}>
        <Animated.View style={[StyleSheet.absoluteFill, transformStyle, style]}>
          {children}
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  )
}
