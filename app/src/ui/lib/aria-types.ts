export enum AriaHasPopup {
  Dialog = 'dialog',
  Menu = 'menu',
  Listbox = 'listbox',
  Tree = 'tree',
  Grid = 'grid',
}

export type AriaHasPopupType =
  | boolean
  | AriaHasPopup.Dialog
  | AriaHasPopup.Menu
  | AriaHasPopup.Listbox
  | AriaHasPopup.Tree
  | AriaHasPopup.Grid
  | undefined
