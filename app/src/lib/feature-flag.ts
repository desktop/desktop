/**
 * Enables the application to opt-in for preview features based on runtime
 * checks. This is backed by the GITHUB_DESKTOP_PREVIEW_FEATURES environment
 * variable, which is checked for non-development environments.
 */
export function enablePreviewFeatures(): boolean {
  if (__DEV__) {
    return true
  }

  if (process.env.GITHUB_DESKTOP_PREVIEW_FEATURES) {
    return true
  }

  return false
}
