import { RE2, RE2JS } from 're2js'
import {
  RepoRulesInfo,
  IRepoRulesMetadataRule,
  RepoRulesMetadataMatcher,
  RepoRuleEnforced,
} from '../../models/repo-rules'
import {
  APIRepoRuleMetadataOperator,
  APIRepoRuleType,
  IAPIRepoRule,
  IAPIRepoRuleMetadataParameters,
  IAPIRepoRuleset,
} from '../api'

/**
 * Parses the GitHub API response for a branch's repo rules into a more useable
 * format.
 */
export function parseRepoRules(
  rules: ReadonlyArray<IAPIRepoRule>,
  rulesets: ReadonlyMap<number, IAPIRepoRuleset>
): RepoRulesInfo {
  const info = new RepoRulesInfo()

  for (const rule of rules) {
    // if a ruleset is null/undefined, then act as if the rule doesn't exist because
    // we don't know what will happen when they push
    const ruleset = rulesets.get(rule.ruleset_id)
    if (ruleset == null) {
      continue
    }

    // a rule may be configured multiple times, and the strictest value always applies.
    // since the rule will not exist in the API response if it's not enforced, we know
    // we're always assigning either 'bypass' or true below. therefore, we only need
    // to check if the existing value is true, otherwise it can always be overridden.
    const enforced =
      ruleset.current_user_can_bypass === 'always' ? 'bypass' : true

    switch (rule.type) {
      case APIRepoRuleType.Update:
      case APIRepoRuleType.RequiredDeployments:
      case APIRepoRuleType.RequiredSignatures:
      case APIRepoRuleType.RequiredStatusChecks:
        info.basicCommitWarning =
          info.basicCommitWarning !== true ? enforced : true
        break

      case APIRepoRuleType.Creation:
        info.creationRestricted =
          info.creationRestricted !== true ? enforced : true
        break

      case APIRepoRuleType.PullRequest:
        info.pullRequestRequired =
          info.pullRequestRequired !== true ? enforced : true
        break

      case APIRepoRuleType.CommitMessagePattern:
        info.commitMessagePatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.CommitAuthorEmailPattern:
        info.commitAuthorEmailPatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.CommitterEmailPattern:
        info.committerEmailPatterns.push(toMetadataRule(rule, enforced))
        break

      case APIRepoRuleType.BranchNamePattern:
        info.branchNamePatterns.push(toMetadataRule(rule, enforced))
        break
    }
  }

  return info
}

function toMetadataRule(
  rule: IAPIRepoRule | undefined,
  enforced: RepoRuleEnforced
): IRepoRulesMetadataRule | undefined {
  if (!rule?.parameters) {
    return undefined
  }

  return {
    enforced,
    matcher: toMatcher(rule.parameters),
    humanDescription: toHumanDescription(rule.parameters),
    rulesetId: rule.ruleset_id,
  }
}

function toHumanDescription(apiParams: IAPIRepoRuleMetadataParameters): string {
  let description = 'must '
  if (apiParams.negate) {
    description += 'not '
  }

  if (apiParams.operator === APIRepoRuleMetadataOperator.RegexMatch) {
    return description + `match the regular expression "${apiParams.pattern}"`
  }

  switch (apiParams.operator) {
    case APIRepoRuleMetadataOperator.StartsWith:
      description += 'start with '
      break

    case APIRepoRuleMetadataOperator.EndsWith:
      description += 'end with '
      break

    case APIRepoRuleMetadataOperator.Contains:
      description += 'contain '
      break
  }

  return description + `"${apiParams.pattern}"`
}

/**
 * Converts the given metadata rule into a matcher function that uses regex to test the rule.
 */
function toMatcher(
  rule: IAPIRepoRuleMetadataParameters | undefined
): RepoRulesMetadataMatcher {
  if (!rule) {
    return () => false
  }

  let regex: RE2

  switch (rule.operator) {
    case APIRepoRuleMetadataOperator.StartsWith:
      regex = RE2JS.compile(`^${RE2JS.quote(rule.pattern)}`)
      break

    case APIRepoRuleMetadataOperator.EndsWith:
      regex = RE2JS.compile(`${RE2JS.quote(rule.pattern)}$`)
      break

    case APIRepoRuleMetadataOperator.Contains:
      regex = RE2JS.compile(`.*${RE2JS.quote(rule.pattern)}.*`)
      break

    case APIRepoRuleMetadataOperator.RegexMatch:
      regex = RE2JS.compile(rule.pattern)
      break
  }

  if (regex) {
    if (rule.negate) {
      return (toMatch: string) => !regex.matcher(toMatch).find()
    } else {
      return (toMatch: string) => regex.matcher(toMatch).find()
    }
  } else {
    return () => false
  }
}
