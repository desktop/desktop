import { getGlobalConfigValue, setGlobalConfigValue } from '../git'

/**
 * The default branch name that GitHub Desktop will use when
 * initializing a new repository.
 */
const DefaultBranchInDesktop = 'main'

/**
 * The name of the Git configuration variable which holds what
 * branch name Git will use when initializing a new repository.
 */
const DefaultBranchSettingName = 'init.defaultBranch'

/**
 * The branch names that Desktop shows by default as radio buttons on the
 * form that allows users to change default branch name.
 */
export const SuggestedBranchNames: ReadonlyArray<string> = ['main', 'master']

/**
 * Returns the configured default branch when creating new repositories
 */
async function getConfiguredDefaultBranch(): Promise<string | null> {
  return getGlobalConfigValue(DefaultBranchSettingName)
}

/**
 * Returns the configured default branch when creating new repositories
 */
export async function getDefaultBranch(): Promise<string> {
  return (await getConfiguredDefaultBranch()) ?? DefaultBranchInDesktop
}

/**
 * Sets the configured default branch when creating new repositories.
 *
 * @param branchName The default branch name to use.
 */
export async function setDefaultBranch(branchName: string) {
  return setGlobalConfigValue(DefaultBranchSettingName, branchName)
}
