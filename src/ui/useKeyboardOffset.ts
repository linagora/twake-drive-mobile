import { useEffect, useState } from 'react'
import { Keyboard } from 'react-native'

/**
 * Height the keyboard currently takes, or 0 when it is down.
 *
 * Paper centres a dialog in its own overlay and does nothing about the
 * keyboard, so a dialog with a text field ends up with its input and its
 * actions underneath it. Giving the dialog a bottom margin of this value
 * centres it in what is left of the screen instead.
 *
 * `active` is the dialog's own visibility: the listeners are only worth
 * holding while it is on screen, and the offset resets when it closes.
 */
export const useKeyboardOffset = (active: boolean): number => {
  const [height, setHeight] = useState(0)

  useEffect(() => {
    if (!active) {
      setHeight(0)
      return
    }
    const shown = Keyboard.addListener('keyboardDidShow', e => setHeight(e.endCoordinates.height))
    const hidden = Keyboard.addListener('keyboardDidHide', () => setHeight(0))
    return () => {
      shown.remove()
      hidden.remove()
    }
  }, [active])

  return height
}
