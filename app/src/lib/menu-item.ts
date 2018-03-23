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
