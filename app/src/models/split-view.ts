/** Which pane is currently focused in repository split view. */
export enum SplitPane {
  Primary = 'primary',
  Secondary = 'secondary',
}

/**
 * How toolbars are presented when two repositories are shown side by side.
 *
 * - Focused: the global top toolbar tracks the focused pane; panes only show
 *   a compact identity header (and a close control on the secondary pane).
 * - PerPane: each pane has its own branch and push/pull controls; the global
 *   toolbar keeps only the repository picker.
 */
export enum SplitToolbarMode {
  Focused = 'focused',
  PerPane = 'per-pane',
}
