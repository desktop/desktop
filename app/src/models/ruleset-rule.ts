/**
 * Ruleset rule info returned from the GitHub API.
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
  public commitMessagePattern?: IRulesetRuleMetadataParameters
  public commitAuthorEmailPattern?: IRulesetRuleMetadataParameters
  public committerEmailPattern?: IRulesetRuleMetadataParameters
  public branchNamePattern?: IRulesetRuleMetadataParameters


  // updateRestricted: boolean
  // linearHistoryRequired: boolean
  // successfulDeploymentsRequired: boolean
  // signedCommitsRequired: boolean
  // statusChecksRequired: boolean
}

/**
 * Metadata parameters for a ruleset pattern rule.
 */
export interface IRulesetRuleMetadataParameters {
  /**
   * User-supplied name/description of the rule
   */
  name: string

  /**
   * Whether the operator is negated. For example, if `true`
   * and {@link operator} is `starts_with`, then the rule
   * will be negated to 'does not start with'.
   */
  negate: boolean

  /**
   * The pattern to match against. If the operator is 'regex', then
   * this is a regex string match. Otherwise, it is a raw string match
   * of the type specified by {@link operator} with no additional parsing.
   */
  pattern: string

  /**
   * The type of match to use for the pattern. For example, `starts_with`
   * means {@link pattern} must be at the start of the string.
   */
  operator: RepositoryRuleMetadataOperator
}

export enum RepositoryRuleMetadataOperator {
  StartsWith = 'starts_with',
  EndsWith = 'ends_with',
  Contains = 'contains',
  RegexMatch = 'regex',
}
