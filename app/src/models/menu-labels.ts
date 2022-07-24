import { Shell } from '../lib/shells'

export type MenuLabelsEvent = {
  /**
   * Specify the user's selected shell to display in the menu.
   *
   * Specify `null` to indicate that it is not known currently, which will
   * default to a placeholder based on the current platform.
   */
  readonly selectedShell: Shell | null

  /**
   * Specify the user's selected editor to display in the menu.
   *
   * Specify `null` to indicate that it is not known currently, which will
   * default to a placeholder based on the current platform.
   */
  readonly selectedExternalEditor: string | null

  /**
   * Has the use enabled "Show confirmation dialog before force pushing"?
   */
  readonly askForConfirmationOnForcePush: boolean

  /**
   * Has the use enabled "Show confirmation dialog before removing repositories"?
   */
  readonly askForConfirmationOnRepositoryRemoval: boolean

  /**
   * Specify the default branch of the user's contribution target.
   *
   * This value should be the fork's upstream default branch, if the user
   * is contributing to the parent repository.
   *
   * Otherwise, this value should be the default branch of the repository.
   *
   * Omit this value to indicate that the default branch is unknown.
   */
  readonly contributionTargetDefaultBranch?: string

  /**
   * Is the current branch in a state where it can be force pushed to the remote?
   */
  readonly isForcePushForCurrentRepository?: boolean

  /**
   * Specify whether a pull request is associated with the current branch.
   */
  readonly hasCurrentPullRequest?: boolean

  /**
   * Specify whether a stashed change is accessible in the current branch.
   */
  readonly isStashedChangesVisible?: boolean

  /**
   * Whether or not attempting to stash working directory changes will result
   * in a confirmation dialog asking the user whether they want to override
   * their existing stash or not.
   */
  readonly askForConfirmationWhenStashingAllChanges?: boolean
}
