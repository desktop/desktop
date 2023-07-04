export interface IFoundEditor<T> {
  readonly editor: T
  readonly path: string
  /**
   * Indicate to Desktop to launch the editor with the `shell: true` option included.
   *
   * This is available to all platforms, but is only currently used by some Windows
   * editors as their launch programs end in `.cmd`
   */
  readonly usesShell?: boolean
}
