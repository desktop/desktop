import * as React from 'react'

import { getPlatformSpecificNameOrSymbolForModifier } from '../lib/menu-item'
import { MenuItem } from '../models/app-menu'

interface IKeyboardShortcutProps {
  /**
   * An array of strings (one for each key), or a `MenuItem`,
   * from which the array of strings will be extracted.
   */
  readonly keyCombo: ReadonlyArray<string> | MenuItem
}

export const KeyboardShortcut: React.SFC<IKeyboardShortcutProps> = props => {
  // TODO: clean up this type differentiation
  const keys = Array.isArray(props.keyCombo)
    ? (props.keyCombo as ReadonlyArray<string>)
    : extractKeyCombo(props.keyCombo as MenuItem)
  return (
    <>
      {keys.map((k, i) => (
        <kbd key={k + i}>{k}</kbd>
      ))}
    </>
  )
}

export function extractKeyCombo(item: MenuItem): ReadonlyArray<string> {
  if (item.type === 'separator' || item.type === 'submenuItem') {
    return []
  }

  if (item.accelerator === null) {
    return []
  }

  return item.accelerator
    .split('+')
    .map(getPlatformSpecificNameOrSymbolForModifier)
}
