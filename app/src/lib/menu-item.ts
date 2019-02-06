export interface IMenuItem {
  /** The user-facing label. */
  readonly label?: string

  /** The action to invoke when the user selects the item. */
  readonly action?: () => void

  /** The type of item. */
  readonly type?: 'separator'

  /** Is the menu item enabled? Defaults to true. */
  readonly enabled?: boolean

  /**
   * The predefined behavior of the menu item.
   *
   * When specified the click property will be ignored.
   * See https://electronjs.org/docs/api/menu-item#roles
   */
  readonly role?: string
}

/**
 * Converts Electron accelerator modifiers to their platform specific
 * name or symbol.
 *
 * Example: CommandOrControl becomes either '⌘' or 'Ctrl' depending on platform.
 *
 * See https://github.com/electron/electron/blob/fb74f55/docs/api/accelerator.md
 */
export function getPlatformSpecificNameOrSymbolForModifier(
  modifier: string
): string {
  switch (modifier.toLowerCase()) {
    case 'cmdorctrl':
    case 'commandorcontrol':
      return __DARWIN__ ? '⌘' : 'Ctrl'

    case 'ctrl':
    case 'control':
      return __DARWIN__ ? '⌃' : 'Ctrl'

    case 'shift':
      return __DARWIN__ ? '⇧' : 'Shift'
    case 'alt':
      return __DARWIN__ ? '⌥' : 'Alt'

    // Mac only
    case 'cmd':
    case 'command':
      return '⌘'
    case 'option':
      return '⌥'

    // Special case space because no one would be able to see it
    case ' ':
      return 'Space'
  }

  // Not a known modifier, likely a normal key
  return modifier
}
