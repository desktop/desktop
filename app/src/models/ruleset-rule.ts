/**
 * Metadata restrictions for a specific type of rule, as multiple can
 * be configured at once and all apply to the branch.
 */
export class BranchRulesetMetadataRules {
  private rules: IBranchRulesetMetadataRule[] = []

  public push(rule?: IBranchRulesetMetadataRule): void {
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
  public commitMessagePatterns = new BranchRulesetMetadataRules()
  public commitAuthorEmailPatterns = new BranchRulesetMetadataRules()
  public committerEmailPatterns = new BranchRulesetMetadataRules()
  public branchNamePatterns = new BranchRulesetMetadataRules()
}

export interface IBranchRulesetMetadataRule {
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
