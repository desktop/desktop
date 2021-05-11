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

/** Should the app show hide whitespace in changes tab */
export function enableHideWhitespaceInDiffOption(): boolean {
  return true
}

/** Should the app use the shiny new TCP-based trampoline? */
export function enableDesktopTrampoline(): boolean {
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

/** Should we allow apps running from Rosetta to auto-update to ARM64 builds? */
export function enableUpdateFromRosettaToARM64(): boolean {
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
  return enableBetaFeatures()
}
