/**
 * Ruleset rule info for the current branch.
 */
export class BranchRulesetInfo {
  /**
   * Many rules are not handled in a special way, they
   * instead just display a warning to the user when they're
   * about to commit. They're lumped together into this flag
   * for simplicity. See the `parseRulesetRules` function for
   * the full list.
   */
  public basicCommitWarning = false

  /**
   * If true, the branch's name conflicts with a rule and
   * cannot be created.
   */
  public creationRestricted = false

  /**
   * If true, the branch cannot be deleted.
   */
  public deletionRestricted = false
  public pullRequestRequired = false
  public forcePushesBlocked = false
  public commitMessagePattern?: IMetadataRule
  public commitAuthorEmailPattern?: IMetadataRule
  public committerEmailPattern?: IMetadataRule
  public branchNamePattern?: IMetadataRule
}

export interface IMetadataRule {
  /**
   * Function that determines whether the provided string matches the rule.
   */
  matcher: RulesetMetadataMatcher

  /**
   * Human-readable description of the rule. For example, a 'starts_with'
   * rule with the pattern 'abc' that is negated would have a description
   * of 'must not start with "abc"'.
   */
  humanDescription: string
}

export type RulesetMetadataMatcher = (toMatch: string) => boolean
