import { Shell } from '../lib/shells'
import { ExternalEditor } from '../lib/editors'

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
  readonly selectedExternalEditor: ExternalEditor | null

  /**
   * Has the use enabled "Show confirmation dialog before force pushing"?
   */
  readonly askForConfirmationOnForcePush: boolean

  /**
   * Has the use enabled "Show confirmation dialog before removing repositories"?
   */
  readonly askForConfirmationOnRepositoryRemoval: boolean

  /**
   * Specify the default branch associated with the current repository.
   *
   * Omit this value to indicate that the default branch is unknown.
   */
  readonly defaultBranchName?: string

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
}
