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

/** Should the app automatically prune branches that are no longer actively being used */
export function enableBranchPruning(): boolean {
  return true
}

/**
 * Whether or not to activate the "Create PR" blankslate action.
 *
 * The state of the feature as of writing this is that the underlying
 * data source required to power this feature is not reliable enough
 * and needs looking at so we aren't ready to move this to production
 * just yet.
 */
export function enableNoChangesCreatePRBlankslateAction(): boolean {
  return true
}

/**
 *  Enables a new UI for the repository picker that supports
 *  grouping and filtering (GitHub) repositories by owner/organization.
 */
export function enableGroupRepositoriesByOwner(): boolean {
  return true
}

/** Should the app show the "rebase current branch" dialog? */
export function enableRebaseDialog(): boolean {
  return true
}

/** Should the app show the "stash changes" dialog? */
export function enableStashing(): boolean {
  return true
}

/**
 * Should the application query for branch protection information and store this
 * to help the maintainers understand how broadly branch protections are
 * encountered?
 */
export function enableBranchProtectionChecks(): boolean {
  return true
}

/** Should the app detect Windows Subsystem for Linux as a valid shell? */
export function enableWSLDetection(): boolean {
  return enableBetaFeatures()
}

/**
 * Should the application warn the user when they are about to commit to a
 * protected branch, and encourage them into a flow to move their changes to
 * a new branch?
 *
 * As this builds upon existing branch protection features in the codebase, this
 * flag is linked to to `enableBranchProtectionChecks()`.
 */
export function enableBranchProtectionWarningFlow(): boolean {
  return true
}

export function enableHideWhitespaceInDiffOption(): boolean {
  return true
}

/**
 * Should we enable the onboarding tutorial. This includes the initial
 * configuration of the tutorial repo as well as the tutorial itself.
 */
export function enableTutorial(): boolean {
  return true
}

/**
 * Should we show the create fork dialog flow?
 */
export function enableCreateForkFlow(): boolean {
  return true
}

/**
 * Whether or not we should attempt to detect the specific curl
 * error from the WinSSL (schannel) https backend when it fails
 * to check the revocation details of a certificate due to lacking
 * CRL distribution points and/or an offiline revocation server.
 */
export function enableSchannelCheckRevokeOptOut(): boolean {
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
 * Should we show the NDDB banner?
 *
 * (It's a notification in the history sidebar that there
 * are new commits upstream.)
 */
export function enableNDDBBanner(): boolean {
  return enableBetaFeatures()
}

/**
 * Should we show the git tag information in the app UI?
 */
export function enableGitTagsDisplay(): boolean {
  return enableDevelopmentFeatures()
}

/**
 * Should we allow users to create git tags from the app?
 */
export function enableGitTagsCreation(): boolean {
  return enableDevelopmentFeatures()
}
