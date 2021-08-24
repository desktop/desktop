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
  return enableBetaFeatures()
}

export function enableReadmeOverwriteWarning(): boolean {
  return enableBetaFeatures()
}

/** Should the app detect Windows Subsystem for Linux as a valid shell? */
export function enableWSLDetection(): boolean {
  return enableBetaFeatures()
}

/** Should the app show hide whitespace in changes tab */
export function enableHideWhitespaceInDiffOption(): boolean {
  return true
}

/**
 * Should we use the new diff viewer for unified diffs?
 */
export function enableExperimentalDiffViewer(): boolean {
  return false
}

/**
 * Should we allow reporting unhandled rejections as if they were crashes?
 */
export function enableUnhandledRejectionReporting(): boolean {
  return enableBetaFeatures()
}

/** Should we allow expanding text diffs? */
export function enableTextDiffExpansion(): boolean {
  return true
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

/** Should we allow using the save dialog when choosing where to clone a repo */
export function enableSaveDialogOnCloneRepository(): boolean {
  return true
}

/** Should we allow setting repository aliases? */
export function enableRepositoryAliases(): boolean {
  return true
}

/** Should we allow to create branches from a commit? */
export function enableBranchFromCommit(): boolean {
  return true
}

/** Should we allow squashing? */
export function enableSquashing(): boolean {
  return true
}

/** Should we allow squash-merging? */
export function enableSquashMerging(): boolean {
  return true
}

/** Should we allow amending commits? */
export function enableAmendingCommits(): boolean {
  return true
}

/** Should we allow reordering commits? */
export function enableCommitReordering(): boolean {
  return true
}

/** Should we allow resetting to a previous commit? */
export function enableResetToCommit(): boolean {
  return enableDevelopmentFeatures()
}

/** Should we show line changes (added/deleted) in commits? */
export function enableLineChangesInCommit(): boolean {
  return enableBetaFeatures()
}

/** Should we allow using Windows' OpenSSH? */
export function enableWindowsOpenSSH(): boolean {
  return enableBetaFeatures()
}

/** Should we use SSH askpass? */
export function enableSSHAskPass(): boolean {
  return enableBetaFeatures()
}

/** Should we use the setImmediate alternative? */
export function enableSetAlmostImmediate(): boolean {
  // We only noticed the problem with `setImmediate` on macOS, so no need to
  // use this trick on Windows for now.
  return __DARWIN__ && enableBetaFeatures()
}
