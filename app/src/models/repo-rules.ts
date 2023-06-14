/**
 * Metadata restrictions for a specific type of rule, as multiple can
 * be configured at once and all apply to the branch.
 */
export class RepoRulesMetadataRules {
  private rules: IRepoRulesMetadataRule[] = []

  public push(rule?: IRepoRulesMetadataRule): void {
    if (rule === undefined) {
      return
    }

    this.rules.push(rule)
  }

  /**
   * Whether any rules are configured.
   */
  public get hasRules(): boolean {
    return this.rules.length > 0
  }

  /**
   * Gets an array of human-readable rules that fail to match
   * the provided input string. If the returned array is empty,
   * then all rules match.
   */
  public getFailedRules(toMatch: string): string[] {
    return this.rules
      .filter(rule => !rule.matcher(toMatch))
      .map(rule => rule.humanDescription)
  }
}

/**
 * Parsed repo rule info
 */
export class RepoRulesInfo {
  /**
   * Many rules are not handled in a special way, they
   * instead just display a warning to the user when they're
   * about to commit. They're lumped together into this flag
   * for simplicity. See the `parseRepoRules` function for
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
  public commitMessagePatterns = new RepoRulesMetadataRules()
  public commitAuthorEmailPatterns = new RepoRulesMetadataRules()
  public committerEmailPatterns = new RepoRulesMetadataRules()
  public branchNamePatterns = new RepoRulesMetadataRules()
}

export interface IRepoRulesMetadataRule {
  /**
   * Function that determines whether the provided string matches the rule.
   */
  matcher: RepoRulesMetadataMatcher

  /**
   * Human-readable description of the rule. For example, a 'starts_with'
   * rule with the pattern 'abc' that is negated would have a description
   * of 'must not start with "abc"'.
   */
  humanDescription: string
}

export type RepoRulesMetadataMatcher = (toMatch: string) => boolean
