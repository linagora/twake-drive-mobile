import React from 'react'
import { AccessibilityRole, AccessibilityState } from 'react-native'
import { List } from 'react-native-paper'

type ListItemProps = React.ComponentProps<typeof List.Item>

export interface AccessibleRowProps extends Pick<
  ListItemProps,
  | 'title'
  | 'description'
  | 'descriptionNumberOfLines'
  | 'left'
  | 'right'
  | 'style'
  | 'titleStyle'
  | 'onPress'
  | 'onLongPress'
  | 'testID'
> {
  /** What a screen reader announces for the whole row, composed by the caller. */
  label: string
  /** What activating the row does, when the label alone does not say it. */
  hint?: string
  /** Defaults to `button` when the row is pressable, and to none when it is not. */
  role?: AccessibilityRole
  selected?: boolean
  checked?: boolean
  disabled?: boolean
}

/**
 * A list row that carries an accessibility contract. Paper's `List.Item` ships
 * none — no role, no state — so every row in the app was announced as an
 * unlabelled, role-less element. Rendering is delegated to it unchanged; this
 * component only adds the semantics, which is why adopting it moves no pixel.
 */
export const AccessibleRow = ({
  label,
  hint,
  role,
  selected,
  checked,
  disabled,
  onPress,
  ...listItemProps
}: AccessibleRowProps): React.ReactElement => {
  // An unset state is left out rather than sent as `false`: a row that cannot
  // be selected must not have VoiceOver announce "not selected" on every pass.
  const state: AccessibilityState = {}
  if (selected !== undefined) state.selected = selected
  if (checked !== undefined) state.checked = checked
  if (disabled !== undefined) state.disabled = disabled

  return (
    <List.Item
      {...listItemProps}
      onPress={onPress}
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityRole={role ?? (onPress ? 'button' : undefined)}
      accessibilityState={state}
    />
  )
}
