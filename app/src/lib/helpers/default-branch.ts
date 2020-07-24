import { getGlobalConfigValue, setGlobalConfigValue } from '../git'

const DefaultBranchInGit = 'master'

const DefaultBranchSettingName = 'init.defaultBranch'

/**
 * The branch names that Desktop shows by default as radio buttons on the
 * form that allows users to change default branch name.
 */
export const SuggestedBranchNames: ReadonlyArray<string> = ['master', 'main']

/**
 * Returns the configured default branch when creating new repositories
 */
export async function getDefaultBranch(): Promise<string> {
  return (
    (await getGlobalConfigValue(DefaultBranchSettingName)) ?? DefaultBranchInGit
  )
}

/**
 * Sets the configured default branch when creating new repositories.
 *
 * @param branchName The default branch name to use.
 */
export async function setDefaultBranch(branchName: string) {
  return setGlobalConfigValue('init.defaultBranch', branchName)
}
