export enum ForkContributionTargets {
  Parent = 'parent',
  Self = 'self',
}

export type ForkContributionTarget =
  | ForkContributionTargets.Parent
  | ForkContributionTargets.Self

/**
 * Collection of configurable settings regarding how the user may work with a repository.
 */
export type WorkflowPreferences = {
  /**
   * What repo does the user want to contribute to with this fork?
   */
  readonly forkContributionTarget?: ForkContributionTarget
}
