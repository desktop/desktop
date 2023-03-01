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
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore: this will be used again in the future
function enableBetaFeatures(): boolean {
  return enableDevelopmentFeatures() || __RELEASE_CHANNEL__ === 'beta'
}

/** Should git pass `--recurse-submodules` when performing operations? */
export function enableRecurseSubmodulesFlag(): boolean {
  return true
}

export function enableReadmeOverwriteWarning(): boolean {
  return enableBetaFeatures()
}

/** Should the app detect Windows Subsystem for Linux as a valid shell? */
export function enableWSLDetection(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we use the new diff viewer for unified diffs?
 */
export function enableExperimentalDiffViewer(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we allow reporting unhandled rejections as if they were crashes?
 */
export function enableUnhandledRejectionReporting(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we allow x64 apps running under ARM translation to auto-update to
 * ARM64 builds?
 */
export function enableUpdateFromEmulatedX64ToARM64(): boolean {
  if (__DARWIN__) {
    return true
  }

  return enableBetaFeatures()
}

/** Should we allow resetting to a previous commit? */
export function enableResetToCommit(): boolean {
  return enableDevelopmentFeatures()
}

/** Should we allow high contrast theme option */
export function enableHighContrastTheme(): boolean {
  return enableBetaFeatures()
}

/** Should we allow customizing a theme */
export function enableCustomizeTheme(): boolean {
  return enableBetaFeatures()
}

/** Should ci check runs show logs? */
export function enableCICheckRunsLogs(): boolean {
  return false
}

/** Should we show previous tags as suggestions? */
export function enablePreviousTagSuggestions(): boolean {
  return enableBetaFeatures()
}

/** Should we show a pull-requests quick view? */
export function enablePullRequestQuickView(): boolean {
  return enableDevelopmentFeatures()
}

/** Should we enable displaying multi commit diffs. This also switches diff logic from one commit */
export function enableMultiCommitDiffs(): boolean {
  return true
}

/** Should we enable the new interstitial for submodule diffs? */
export function enableSubmoduleDiff(): boolean {
  return true
}

/** Should we enable starting pull requests? */
export function enableStartingPullRequests(): boolean {
  return true
}

/** Should we enable starting pull requests? */
export function enableStackedPopups(): boolean {
  return true
}

/** Should we enable mechanism to prevent closing while the app is updating? */
export function enablePreventClosingWhileUpdating(): boolean {
  return true
}

/** Should we enable the new push-pull-fetch dropdown? */
export function enablePushPullFetchDropdown(): boolean {
  return enableBetaFeatures()
}

export function enablePullRequestCommentNotifications(): boolean {
  return enableDevelopmentFeatures()
}
