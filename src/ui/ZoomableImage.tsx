import React from 'react'
import { StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'

const MIN_SCALE = 1
const MAX_SCALE = 5
const DOUBLE_TAP_SCALE = 2.5

interface Props {
  uri: string
  headers?: Record<string, string>
  placeholderUri?: string | null
  onSingleTap?: () => void
  onLoad?: () => void
  onError?: (err: unknown) => void
}

/**
 * Image viewer with native-feeling gestures:
 * - Pinch to zoom (1x → 5x, clamped)
 * - Pan to move when zoomed
 * - Double-tap toggles 1x ↔ 2.5x
 *
 * Drag-to-dismiss is delegated to the parent route's pageSheet
 * presentation — the OS handles dismissal coordinated with any inner
 * scroll views.
 */
export const ZoomableImage = ({
  uri,
  headers,
  placeholderUri,
  onSingleTap,
  onLoad,
  onError
}: Props): React.ReactElement => {
  const scale = useSharedValue(1)
  const savedScale = useSharedValue(1)
  const translateX = useSharedValue(0)
  const translateY = useSharedValue(0)
  const savedTranslateX = useSharedValue(0)
  const savedTranslateY = useSharedValue(0)

  const pinch = Gesture.Pinch()
    .onUpdate(e => {
      const next = savedScale.value * e.scale
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE * 0.5, next))
    })
    .onEnd(() => {
      if (scale.value < MIN_SCALE) {
        scale.value = withSpring(MIN_SCALE)
        translateX.value = withSpring(0)
        translateY.value = withSpring(0)
        savedScale.value = MIN_SCALE
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        savedScale.value = scale.value
      }
    })

  // Pan only when zoomed in — moves the image around. At base scale we
  // fail the gesture so the parent pageSheet can claim it for its
  // drag-down dismiss. Manual activation prevents the Pan from holding
  // the touch on every tap regardless of zoom.
  const pan = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_e, state) => {
      'worklet'
      if (scale.value > 1) state.activate()
      else state.fail()
    })
    .onUpdate(e => {
      translateX.value = savedTranslateX.value + e.translationX
      translateY.value = savedTranslateY.value + e.translationY
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value
      savedTranslateY.value = translateY.value
    })

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDelay(250)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1)
        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        savedScale.value = 1
        savedTranslateX.value = 0
        savedTranslateY.value = 0
      } else {
        scale.value = withTiming(DOUBLE_TAP_SCALE)
        savedScale.value = DOUBLE_TAP_SCALE
      }
    })

  const singleTap = Gesture.Tap()
    .numberOfTaps(1)
    .maxDelay(250)
    .onEnd(() => {
      if (onSingleTap) runOnJS(onSingleTap)()
    })

  const composed = Gesture.Simultaneous(
    Gesture.Simultaneous(pinch, pan),
    Gesture.Exclusive(doubleTap, singleTap)
  )

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value }
    ]
  }))

  return (
    <GestureDetector gesture={composed}>
      <Animated.View style={[StyleSheet.absoluteFill, animatedStyle]}>
        <Image
          source={{ uri, headers }}
          placeholder={placeholderUri ? { uri: placeholderUri } : undefined}
          placeholderContentFit="contain"
          style={styles.image}
          contentFit="contain"
          transition={150}
          onLoad={onLoad}
          onError={onError}
        />
      </Animated.View>
    </GestureDetector>
  )
}

const styles = StyleSheet.create({
  image: { width: '100%', height: '100%' }
})
