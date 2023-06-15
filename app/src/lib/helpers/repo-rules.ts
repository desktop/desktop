import * as React from 'react'
import { escapeRegExp } from 'lodash'
import { RepoRulesInfo, IRepoRulesMetadataRule, RepoRulesMetadataMatcher } from "../../models/repo-rules";
import { APIRepoRuleMetadataOperator, IAPIRepoRule, IAPIRepoRuleMetadataParameters } from "../api";
import { GitHubRepository } from '../../models/github-repository';
import { LinkButton } from '../../ui/lib/link-button';


export function getRepoRulesLink(repo: GitHubRepository | null, branchName: string | null, capitalize?: boolean): string | JSX.Element {
  let text = 'one'
  if (capitalize) {
    text = 'One'
  }

  text += ' or more rules'

  if (!repo || !branchName) {
    return text
  }

  const link = `${repo.htmlURL}/rules/?ref=${encodeURIComponent('refs/heads/' + branchName)}`
  return React.createElement(LinkButton, { uri: link }, text)
}

/**
 * Parses the GitHub API response for a branch's repo rules into a more useable
 * format.
 */
export function parseRepoRules(rules: ReadonlyArray<IAPIRepoRule>): RepoRulesInfo {
  const info = new RepoRulesInfo()

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

function toMetadataRule(apiParams: IAPIRepoRuleMetadataParameters | undefined): IRepoRulesMetadataRule | undefined {
  if (!apiParams) {
    return undefined
  }

  return {
    matcher: toMatcher(apiParams),
    humanDescription: toHumanDescription(apiParams),
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
function toMatcher(rule: IAPIRepoRuleMetadataParameters | undefined): RepoRulesMetadataMatcher {
  if (!rule) {
    return () => false
  }

  let regex: RegExp

  switch (rule.operator) {
    case APIRepoRuleMetadataOperator.StartsWith:
      regex = new RegExp(`^${escapeRegExp(rule.pattern)}`)
      break

    case APIRepoRuleMetadataOperator.EndsWith:
      regex = new RegExp(`${escapeRegExp(rule.pattern)}$`)
      break

    case APIRepoRuleMetadataOperator.Contains:
      regex = new RegExp(`.*${escapeRegExp(rule.pattern)}.*`)
      break

    case APIRepoRuleMetadataOperator.RegexMatch:
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
