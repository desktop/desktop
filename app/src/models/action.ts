/**
 * A state representing the app computing whether a planned action will require
 * further work by the user to complete.
 */
export enum ComputedActionKind {
  /** The action is being computed in the background */
  Loading = 'loading',
  /** The action cannot be completed, for reasons the app should explain */
  Invalid = 'invalid',
  /** The action should complete without any additional work required by the user */
  Clean = 'clean',
  /** The action requires additional work by the user to complete succesfully */
  Conflicts = 'conflicts',
}
