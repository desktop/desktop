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

/** Should we show progress bars on the Windows app taskbar icon? */
export function enableProgressBarOnIcon(): boolean {
  return enableBetaFeatures()
}

/** Should the app enable beta features? */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
//@ts-ignore: this will be used again in the future
function enableBetaFeatures(): boolean {
  return enableDevelopmentFeatures() || __RELEASE_CHANNEL__ === 'beta'
}

/** Should git pass `--recurse-submodules` when performing operations? */
export function enableRecurseSubmodulesFlag(): boolean {
  return enableBetaFeatures()
}

export function enableReadmeOverwriteWarning(): boolean {
  return enableBetaFeatures()
}

/** Should the app detect Windows Subsystem for Linux as a valid shell? */
export function enableWSLDetection(): boolean {
  return enableBetaFeatures()
}

/** Should the app use the shiny new TCP-based trampoline? */
export function enableDesktopTrampoline(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we show the create fork dialog flow?
 */
export function enableCreateForkFlow(): boolean {
  return true
}

/**
 * Whether or not to enable support for automatically resolving the
 * system-configured proxy url and passing that to Git.
 */
export function enableAutomaticGitProxyConfiguration(): boolean {
  return true
}

/**
 * Should we show the "Create Issue on GitHub" item under
 * "Repository" in the app menu?
 */
export function enableCreateGitHubIssueFromMenu(): boolean {
  return true
}

/**
 * Should we update remote url if it has changed?
 */
export function enableUpdateRemoteUrl(): boolean {
  return true
}

/**
 * Should we show the fork-specific, "branch from the upstream
 * default branch" version of the create branch dialog?
 */
export function enableForkyCreateBranchUI(): boolean {
  return true
}

/**
 * Should we show the git tag information in the app UI?
 */
export function enableGitTagsDisplay(): boolean {
  return true
}

/**
 * Should we allow users to create git tags from the app?
 */
export function enableGitTagsCreation(): boolean {
  return true
}

/**
 * Should we show the dialogs to allow users customize which is the
 * main repository when opening a fork?
 */
export function enableForkSettings(): boolean {
  return true
}

/**
 * Should we show the discard lines/hunks context menu item?
 */
export function enableDiscardLines(): boolean {
  return true
}

/**
 * Should we show the checkbox to enable side by side diffs?
 *
 * Note: side by side diffs will use the new diff viewer.
 */
export function enableSideBySideDiffs(): boolean {
  return true
}

/**
 * Should we use the new diff viewer for unified diffs?
 */
export function enableExperimentalDiffViewer(): boolean {
  return false
}

/**
 * Should we allow to change the default branch when creating new repositories?
 */
export function enableDefaultBranchSetting(): boolean {
  return true
}

/**
 * Should we allow reporting unhandled rejections as if they were crashes?
 */
export function enableUnhandledRejectionReporting(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we allow cherry picking
 */
export function enableCherryPicking(): boolean {
  return enableBetaFeatures()
}
