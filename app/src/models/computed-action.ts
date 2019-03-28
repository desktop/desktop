/**
 * An action being computed in the background on behalf of the user
 */
export enum ComputedAction {
  /** The action is being computed in the background */
  Loading = 'loading',
  /** The action should complete without any additional work required by the user */
  Clean = 'clean',
  /** The action requires additional work by the user to complete successfully */
  Conflicts = 'conflicts',
  /** The action cannot be completed, for reasons the app should explain */
  Invalid = 'invalid',
}
