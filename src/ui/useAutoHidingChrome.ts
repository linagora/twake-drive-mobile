import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Animated } from 'react-native'

/** How long the bar stays on screen with nothing happening. */
export const CHROME_VISIBLE_MS = 2500
/** Long enough to read as a fade, short enough not to sit over the document. */
export const CHROME_FADE_MS = 200

export interface AutoHidingChrome {
  visible: boolean
  opacity: Animated.Value
  /** Brings the bar back and gives it another turn on screen. */
  reveal: () => void
}

/**
 * The viewer's floating bar: on screen when the document opens, gone shortly
 * after, back on the next touch. It sits over the document, so leaving it up
 * hides the first line of what is being read.
 */
export const useAutoHidingChrome = (): AutoHidingChrome => {
  const opacity = useMemo(() => new Animated.Value(1), [])
  const [visible, setVisible] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const hideLater = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setVisible(false), CHROME_VISIBLE_MS)
  }, [])

  const reveal = useCallback(() => {
    setVisible(true)
    hideLater()
  }, [hideLater])

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: CHROME_FADE_MS,
      useNativeDriver: true
    }).start()
  }, [opacity, visible])

  useEffect(() => {
    hideLater()
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [hideLater])

  return { visible, opacity, reveal }
}
