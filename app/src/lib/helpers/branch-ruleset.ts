import { escapeRegExp } from 'lodash'
import { BranchRulesetInfo, IBranchRulesetMetadataRule, RulesetMetadataMatcher } from "../../models/ruleset-rule";
import { APIRepositoryRuleMetadataOperator, IAPIRulesetRule, IAPIRulesetRuleMetadataParameters } from "../api";

/**
 * Parses the GitHub API response for a branch's ruleset rules into a more useable
 * format.
 */
export function parseRulesetRules(rules: ReadonlyArray<IAPIRulesetRule>): BranchRulesetInfo {
  const info = new BranchRulesetInfo()

  for (const rule of rules) {
    switch (rule.type) {
      case 'update':
      case 'required_linear_history':
      case 'required_deployments':
      case 'required_signatures':
      case 'required_status_checks':
        info.basicCommitWarning = true
        break

      case 'creation':
        info.creationRestricted = true
        break

      case 'deletion':
        info.deletionRestricted = true
        break

      case 'pull_request':
        info.pullRequestRequired = true
        break

      case 'non_fast_forward':
        info.forcePushesBlocked = true
        break

      case 'commit_message_pattern':
        info.commitMessagePatterns.push(toMetadataRule(rule.parameters))
        break

      case 'commit_author_email_pattern':
        info.commitAuthorEmailPatterns.push(toMetadataRule(rule.parameters))
        break

      case 'committer_email_pattern':
        info.committerEmailPatterns.push(toMetadataRule(rule.parameters))
        break

      case 'branch_name_pattern':
        info.branchNamePatterns.push(toMetadataRule(rule.parameters))
        break
    }
  }

  return info
}

function toMetadataRule(apiParams: IAPIRulesetRuleMetadataParameters | undefined): IBranchRulesetMetadataRule | undefined {
  if (!apiParams) {
    return undefined
  }

  return {
    matcher: toMatcher(apiParams),
    humanDescription: toHumanDescription(apiParams),
  }
}

function toHumanDescription(apiParams: IAPIRulesetRuleMetadataParameters): string {
  let description = 'must '
  if (apiParams.negate) {
    description += 'not '
  }

  if (apiParams.operator === APIRepositoryRuleMetadataOperator.RegexMatch) {
    return description + `match the regular expression "${apiParams.pattern}"`
  }

  switch (apiParams.operator) {
    case APIRepositoryRuleMetadataOperator.StartsWith:
      description += 'start with '
      break

    case APIRepositoryRuleMetadataOperator.EndsWith:
      description += 'end with '
      break

    case APIRepositoryRuleMetadataOperator.Contains:
      description += 'contain '
      break
  }

  return description + `"${apiParams.pattern}"`
}

/**
 * Converts the given metadata rule into a matcher function that uses regex to test the rule.
 */
function toMatcher(rule: IAPIRulesetRuleMetadataParameters | undefined): RulesetMetadataMatcher {
  if (!rule) {
    return () => false
  }

  let regex: RegExp

  switch (rule.operator) {
    case APIRepositoryRuleMetadataOperator.StartsWith:
      regex = new RegExp(`^${escapeRegExp(rule.pattern)}`)
      break

    case APIRepositoryRuleMetadataOperator.EndsWith:
      regex = new RegExp(`${escapeRegExp(rule.pattern)}$`)
      break

    case APIRepositoryRuleMetadataOperator.Contains:
      regex = new RegExp(`.*${escapeRegExp(rule.pattern)}.*`)
      break

    case APIRepositoryRuleMetadataOperator.RegexMatch:
      regex = new RegExp(rule.pattern)
      break
  }

  if (regex) {
    if (rule.negate) {
      return (toMatch: string) => !regex.test(toMatch)
    } else {
      return (toMatch: string) => regex.test(toMatch)
    }
  } else {
    return () => false
  }
}
