const Disable = false

/**
 * Enables the application to opt-in for preview features based on runtime
 * checks. This is backed by the GITHUB_DESKTOP_PREVIEW_FEATURES environment
 * variable, which is checked for non-development environments.
 */
function enableDevelopmentFeatures(): boolean {
  if (Disable) {
    return false
  }

  if (__DEV__) {
    return true
  }

  if (process.env.GITHUB_DESKTOP_PREVIEW_FEATURES) {
    return true
  }

  return false
}

/** Should the app enable beta features? */
function enableBetaFeatures(): boolean {
  return enableDevelopmentFeatures() || __RELEASE_CHANNEL__ === 'beta'
}

/** Should PR integration be enabled? */
export function enablePRIntegration(): boolean {
  return enableBetaFeatures()
}

/** Should merge tool integration be enabled? */
export function enableMergeTool(): boolean {
  return enableDevelopmentFeatures()
}
