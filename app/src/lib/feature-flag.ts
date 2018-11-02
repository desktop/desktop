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

  if (process.env.GITHUB_DESKTOP_PREVIEW_FEATURES === '1') {
    return true
  }

  return false
}

/** Should the app enable beta features? */
//@ts-ignore: this will be used again in the future
function enableBetaFeatures(): boolean {
  return enableDevelopmentFeatures() || __RELEASE_CHANNEL__ === 'beta'
}

/** Should merge tool integration be enabled? */
export function enableMergeTool(): boolean {
  return enableDevelopmentFeatures()
}

/** Should the Notification of Diverging From Default Branch (NDDB) feature be enabled? */
export function enableNotificationOfBranchUpdates(): boolean {
  return true
}

/** Should the repository list display info indicators? */
export function enableRepoInfoIndicators(): boolean {
  return true
}

/** Should the app try and detect conflicts before the user stumbles into them? */
export function enableMergeConflictDetection(): boolean {
  return true
}

/** Should the app display the new release notes dialog? */
export function enableInAppReleaseNotes(): boolean {
  return true
}

/** Should `git status` use --no-optional-locks to assist with concurrent usage */
export function enableStatusWithoutOptionalLocks(): boolean {
  return true
}

/** Should git pass `--recurse-submodules` when performing operations? */
export function enableRecurseSubmodulesFlag(): boolean {
  return enableBetaFeatures()
}

/** Should the app use the MergeConflictsDialog component and flow? */
export function enableMergeConflictsDialog(): boolean {
  return enableBetaFeatures()
}
